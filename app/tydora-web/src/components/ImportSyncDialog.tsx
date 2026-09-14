import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import AppModal from "./AppModal";
import {
  loadImportMapping,
  removeImportRecord,
  planImportSync,
  applyImportSync,
  type ImportRecord,
  type SyncPlan,
  type SyncResult,
} from "../services/importMirror";
import "./ImportSyncDialog.css";

interface ImportSyncDialogProps {
  open: boolean;
  onClose: () => void;
  /** 当前仓库根目录（映射表与落点都相对它解析） */
  vaultPath: string;
  /** 某条记录同步完成，回传其仓库内落点，供外层刷新文件树 */
  onSynced?: (destRel: string) => void;
}

type Status =
  | { kind: "result"; result: SyncResult }
  | { kind: "missing" }
  | { kind: "error"; message: string };

const KIND_LABEL_KEY: Record<ImportRecord["kind"], string> = {
  folder: "sidebar.sync.kindFolder",
  file: "sidebar.sync.kindFile",
};

function recKey(record: ImportRecord): string {
  return `${record.source}\u0000${record.dest}`;
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

/** 同步结果一行摘要：新增 / 更新 / 覆盖 / 未变 */
function resultText(result: SyncResult, t: (k: string, o?: Record<string, unknown>) => string): string {
  const parts = [
    t("sidebar.sync.resultAdded", { count: result.added }),
    t("sidebar.sync.resultUpdated", { count: result.updated }),
    t("sidebar.sync.resultOverwritten", { count: result.overwritten }),
    t("sidebar.sync.resultUnchanged", { count: result.unchanged }),
  ];
  if (result.failed > 0) parts.push(t("sidebar.sync.resultFailed", { count: result.failed }));
  if (result.removed > 0) parts.push(t("sidebar.sync.removedNote", { count: result.removed }));
  return parts.join(" · ");
}

export default function ImportSyncDialog({ open, onClose, vaultPath, onSynced }: ImportSyncDialogProps) {
  const { t } = useTranslation();
  const [records, setRecords] = useState<ImportRecord[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [pending, setPending] = useState<{ record: ImportRecord; plan: SyncPlan } | null>(null);

  const reload = useCallback(async () => {
    try {
      const mapping = await loadImportMapping(vaultPath);
      setRecords(mapping.imports);
      setLoadError(false);
    } catch {
      setRecords([]);
      setLoadError(true);
    }
  }, [vaultPath]);

  useEffect(() => {
    if (!open) return;
    setStatuses({});
    setPending(null);
    setBusyKey(null);
    setRecords(null);
    void reload();
  }, [open, reload]);

  const runSync = useCallback(
    async (record: ImportRecord, plan: SyncPlan) => {
      const key = recKey(record);
      setBusyKey(key);
      try {
        const result = await applyImportSync(vaultPath, record, plan);
        setStatuses((s) => ({ ...s, [key]: { kind: "result", result } }));
        // record 已被就地更新（lastSyncAt/files），换一个数组引用触发重渲染
        setRecords((rs) => (rs ? [...rs] : rs));
        onSynced?.(record.dest);
      } catch (err) {
        setStatuses((s) => ({ ...s, [key]: { kind: "error", message: String(err) } }));
      } finally {
        setBusyKey(null);
      }
    },
    [vaultPath, onSynced],
  );

  /** 先检查再同步：有需要覆盖的文件时先让用户确认清单 */
  const handleSync = useCallback(
    async (record: ImportRecord) => {
      const key = recKey(record);
      setBusyKey(key);
      setPending(null);
      let plan: SyncPlan;
      try {
        plan = await planImportSync(vaultPath, record);
      } catch (err) {
        setStatuses((s) => ({ ...s, [key]: { kind: "error", message: String(err) } }));
        setBusyKey(null);
        return;
      }
      setBusyKey(null);
      if (plan.sourceMissing) {
        setStatuses((s) => ({ ...s, [key]: { kind: "missing" } }));
        return;
      }
      if (plan.conflicts.length > 0) {
        setPending({ record, plan });
        return;
      }
      await runSync(record, plan);
    },
    [runSync, vaultPath],
  );

  const handleConfirm = useCallback(async () => {
    const current = pending;
    if (!current) return;
    setPending(null);
    await runSync(current.record, current.plan);
  }, [pending, runSync]);

  const handleRemove = useCallback(
    async (record: ImportRecord) => {
      try {
        await removeImportRecord(vaultPath, record);
        setStatuses((s) => {
          const next = { ...s };
          delete next[recKey(record)];
          return next;
        });
        await reload();
      } catch (err) {
        setStatuses((s) => ({ ...s, [recKey(record)]: { kind: "error", message: String(err) } }));
      }
    },
    [reload, vaultPath],
  );

  const body = useMemo(() => {
    if (pending) {
      const { record, plan } = pending;
      return (
        <div className="sync-confirm">
          <div className="sync-confirm-title">{t("sidebar.sync.confirmTitle")}</div>
          <div className="sync-confirm-hint">{t("sidebar.sync.confirmHint")}</div>
          <div className="sync-confirm-summary">
            {t("sidebar.sync.confirmSummary", {
              add: plan.toAdd.length,
              update: plan.toUpdate.length,
              conflict: plan.conflicts.length,
            })}
          </div>
          <div className="sync-confirm-path" title={record.dest}>{record.dest}</div>
          <div className="sync-confirm-list">
            {plan.conflicts.map((f) => (
              <div className="sync-confirm-item" key={f.rel}>{f.rel}</div>
            ))}
          </div>
          <div className="sync-confirm-actions">
            <button className="sync-btn" onClick={() => setPending(null)}>
              {t("sidebar.dialog.cancel")}
            </button>
            <button className="sync-btn is-primary" onClick={() => void handleConfirm()}>
              {t("sidebar.sync.confirmApply")}
            </button>
          </div>
        </div>
      );
    }

    if (records === null) {
      return <div className="sync-empty">{t("sidebar.sync.loading")}</div>;
    }
    if (loadError) {
      return <div className="sync-empty">{t("sidebar.sync.loadFailed")}</div>;
    }
    if (records.length === 0) {
      return <div className="sync-empty">{t("sidebar.sync.empty")}</div>;
    }

    return (
      <div className="sync-list">
        {records.map((record) => {
          const key = recKey(record);
          const status = statuses[key];
          const busy = busyKey === key;
          return (
            <div className="sync-record" key={key}>
              <div className="sync-record-main">
                <div className="sync-record-head">
                  <span className="sync-kind">{t(KIND_LABEL_KEY[record.kind])}</span>
                  <span className="sync-record-dest" title={record.dest}>{record.dest}</span>
                  <span className="sync-record-time">
                    {record.lastSyncAt
                      ? t("sidebar.sync.lastSync", { time: formatTime(record.lastSyncAt) })
                      : t("sidebar.sync.neverSynced")}
                  </span>
                </div>
                <div className="sync-record-source" title={record.source}>{record.source}</div>
                {status && (
                  <div className={`sync-status${status.kind === "result" ? "" : " is-warn"}`}>
                    {status.kind === "result" && resultText(status.result, t)}
                    {status.kind === "missing" && t("sidebar.sync.sourceMissing")}
                    {status.kind === "error" && t("sidebar.sync.syncFailed", { message: status.message })}
                  </div>
                )}
              </div>
              <div className="sync-record-actions">
                <button className="sync-btn is-primary" disabled={busy} onClick={() => void handleSync(record)}>
                  {busy ? t("sidebar.sync.planning") : t("sidebar.sync.syncBtn")}
                </button>
                <button className="sync-btn" disabled={busy} onClick={() => void handleRemove(record)}>
                  {t("sidebar.sync.removeBtn")}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }, [busyKey, handleConfirm, handleRemove, handleSync, loadError, pending, records, statuses, t]);

  return (
    <AppModal
      open={open}
      onClose={onClose}
      ariaLabel={t("sidebar.sync.title")}
      closeTitle={t("settings.close")}
      width="760px"
      height="580px"
    >
      <div className="sync-dialog">
        <div className="sync-dialog-header">
          <h2 className="sync-dialog-title">{t("sidebar.sync.title")}</h2>
          <p className="sync-dialog-subtitle">{t("sidebar.sync.subtitle")}</p>
        </div>
        <div className="sync-dialog-body">{body}</div>
      </div>
    </AppModal>
  );
}
