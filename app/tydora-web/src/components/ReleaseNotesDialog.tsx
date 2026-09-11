import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import AppModal from "./AppModal";
import rawReleaseNotes from "../data/release-notes.json";
import "./ReleaseNotesDialog.css";

interface ReleaseNoteItem {
  text: string;
  hash: string;
}

interface ReleaseNoteGroup {
  group: string;
  items: ReleaseNoteItem[];
}

interface ReleaseNoteVersion {
  version: string;
  date: string;
  released: boolean;
  groups: ReleaseNoteGroup[];
}

interface ReleaseNotesData {
  generatedAt: string;
  current: string;
  versions: ReleaseNoteVersion[];
}

const DATA = rawReleaseNotes as ReleaseNotesData;

/** 分组键 → i18n 后缀；未知分组归入 other */
const KNOWN_GROUPS = new Set([
  "feat", "fix", "perf", "refactor", "docs",
  "style", "test", "ci", "build", "chore", "other",
]);

interface ReleaseNotesDialogProps {
  open: boolean;
  onClose: () => void;
  /** 应用当前实际版本，优先于构建期生成的数据 */
  currentVersion?: string;
}

export default function ReleaseNotesDialog({ open, onClose, currentVersion }: ReleaseNotesDialogProps) {
  const { t } = useTranslation();
  const current = currentVersion || DATA.current;

  // 运行版本可能带本地迭代号而变成四段（0.2.7.1），数据里存的是上游三段号（0.2.7）：
  // 两者都匹配，徽标与默认展开才能落在正确的那一条上。
  const baseCurrent = current.split(".").slice(0, 3).join(".");
  const currentIndex = useMemo(
    () => DATA.versions.findIndex((v) => v.version === current || v.version === baseCurrent),
    [current, baseCurrent]
  );
  const activeVersion = currentIndex >= 0 ? DATA.versions[currentIndex].version : "";

  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set([activeVersion || DATA.current])
  );

  const toggle = (version: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(version)) next.delete(version);
      else next.add(version);
      return next;
    });
  };

  return (
    <AppModal
      open={open}
      onClose={onClose}
      ariaLabel={t("settings.about.releaseNotesTitle")}
      closeTitle={t("settings.close")}
      width="760px"
      height="640px"
    >
      <div className="release-notes">
        <header className="release-notes-header">
          <h2 className="release-notes-title">{t("settings.about.releaseNotesTitle")}</h2>
          <p className="release-notes-subtitle">
            {current ? `v${current}` : ""}
            {DATA.generatedAt ? ` · ${t("settings.about.releaseNotesGeneratedAt", { date: DATA.generatedAt })}` : ""}
          </p>
        </header>

        <div className="release-notes-body">
          {DATA.versions.length === 0 && (
            <p className="release-notes-empty">{t("settings.about.releaseNotesEmpty")}</p>
          )}

          {DATA.versions.map((version, index) => {
            const isCurrent = activeVersion
              ? version.version === activeVersion
              : index === 0;
            const isOpen = expanded.has(version.version) || isCurrent;
            return (
              <section
                key={version.version}
                className={`release-notes-version${isCurrent ? " is-current" : ""}`}
              >
                <button
                  type="button"
                  className="release-notes-version-head"
                  onClick={() => toggle(version.version)}
                  aria-expanded={isOpen}
                >
                  <svg
                    className={`release-notes-chevron${isOpen ? " is-open" : ""}`}
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    aria-hidden="true"
                  >
                    <path
                      d="M4 2.5 L7.5 6 L4 9.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="release-notes-version-tag">v{version.version}</span>
                  {isCurrent && (
                    <span className="release-notes-badge">{t("settings.about.releaseNotesCurrent")}</span>
                  )}
                  {!version.released && !isCurrent && (
                    <span className="release-notes-badge is-muted">
                      {t("settings.about.releaseNotesUnreleased")}
                    </span>
                  )}
                  {version.date && <span className="release-notes-date">{version.date}</span>}
                </button>

                {isOpen && (
                  <div className="release-notes-groups">
                    {version.groups.map((group) => (
                      <div key={group.group} className="release-notes-group">
                        <div className="release-notes-group-label">
                          {t(`settings.about.releaseNotesGroups.${KNOWN_GROUPS.has(group.group) ? group.group : "other"}`)}
                        </div>
                        <ul className="release-notes-list">
                          {group.items.map((item) => (
                            <li key={item.hash} className="release-notes-item">
                              <span className="release-notes-item-text">{item.text}</span>
                              <code className="release-notes-item-hash">{item.hash}</code>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </AppModal>
  );
}
