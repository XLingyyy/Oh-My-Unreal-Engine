import { useState } from 'react';
import { useDesktopCopy } from '../../i18n';
import {
  MOCK_ADVANCED_SECTIONS,
  type AdvancedSectionTitleKey,
} from './mockInspectorData';

function resolveTitleKey(key: AdvancedSectionTitleKey): AdvancedSectionTitleKey {
  return key;
}

export function AdvancedInspector() {
  const { copy } = useDesktopCopy();
  const t = copy.ueAgentUi.rightInspector.advanced;
  const [rootOpen, setRootOpen] = useState(false);
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set());

  const toggleSection = (id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <section className="ue-inspector-advanced" aria-label={t.title}>
      <header className="ue-inspector-advanced-header">
        <h3 className="ue-inspector-advanced-title">{t.title}</h3>
        <button
          type="button"
          className="ue-inspector-advanced-toggle"
          aria-expanded={rootOpen}
          aria-controls="ue-inspector-advanced-body"
          aria-label={t.ariaToggleRoot(rootOpen)}
          onClick={() => setRootOpen((prev) => !prev)}
        >
          {rootOpen ? t.collapse : t.expand}
        </button>
      </header>
      {rootOpen && (
        <div id="ue-inspector-advanced-body" className="ue-inspector-advanced-body">
          {MOCK_ADVANCED_SECTIONS.map((section) => {
            const sectionOpen = openSections.has(section.id);
            const title = t[resolveTitleKey(section.titleKey)];
            return (
              <article key={section.id} className="ue-inspector-advanced-section">
                <header className="ue-inspector-advanced-section-header">
                  <h4 className="ue-inspector-advanced-section-title">{title}</h4>
                  <button
                    type="button"
                    className="ue-inspector-advanced-section-toggle"
                    aria-expanded={sectionOpen}
                    aria-controls={`ue-inspector-advanced-section-${section.id}`}
                    aria-label={t.ariaToggleSection(title, sectionOpen)}
                    onClick={() => toggleSection(section.id)}
                  >
                    {sectionOpen ? t.collapse : t.expand}
                  </button>
                </header>
                {sectionOpen && (
                  <pre
                    id={`ue-inspector-advanced-section-${section.id}`}
                    className="ue-inspector-advanced-pre"
                  >
                    <code>{section.body}</code>
                  </pre>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
