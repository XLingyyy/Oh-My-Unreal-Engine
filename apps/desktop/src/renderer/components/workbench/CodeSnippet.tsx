export interface CodeSnippetProps {
  code: string;
  language?: string;
}

export function CodeSnippet({ code, language }: CodeSnippetProps) {
  return (
    <div className="ue-code-snippet">
      {language && <span className="ue-code-snippet-lang">{language}</span>}
      <pre className="ue-code-snippet-pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}
