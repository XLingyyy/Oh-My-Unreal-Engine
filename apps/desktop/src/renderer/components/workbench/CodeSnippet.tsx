import { tokenizeCode } from './agentCardPresentation';

export interface CodeSnippetProps {
  code: string;
  language?: string;
}

export function CodeSnippet({ code, language }: CodeSnippetProps) {
  return (
    <div className="ue-code-snippet">
      {language && <span className="ue-code-snippet-lang">{language}</span>}
      <pre className="ue-code-snippet-pre">
        <code>
          {tokenizeCode(code).map((token, index) => (
            <span
              key={`${index}-${token.kind}`}
              className={`ue-code-token ue-code-token-${token.kind}`}
            >
              {token.text}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
