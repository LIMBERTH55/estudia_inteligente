"use client";

import { Fragment } from "react";

// Renderizador Markdown ligero (títulos, listas, negritas, código, párrafos).
// Suficiente para las respuestas de IA; evita dependencias pesadas.

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;
    if (token.startsWith("**")) {
      nodes.push(
        <strong key={key} className="font-semibold text-slate-900 dark:text-white">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("`")) {
      nodes.push(
        <code
          key={key}
          className="rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-[0.85em] text-violet-700 dark:bg-slate-700/60 dark:text-violet-300"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

export function Markdown({ content, className }: { content: string; className?: string }) {
  const lines = (content || "").split("\n");
  const blocks: React.ReactNode[] = [];
  let listBuffer: string[] = [];
  let orderedBuffer: string[] = [];
  let key = 0;

  const flushLists = () => {
    if (listBuffer.length) {
      blocks.push(
        <ul key={`ul-${key++}`} className="my-2 list-disc space-y-1 pl-5">
          {listBuffer.map((item, i) => (
            <li key={i}>{renderInline(item, `li-${key}-${i}`)}</li>
          ))}
        </ul>
      );
      listBuffer = [];
    }
    if (orderedBuffer.length) {
      blocks.push(
        <ol key={`ol-${key++}`} className="my-2 list-decimal space-y-1 pl-5">
          {orderedBuffer.map((item, i) => (
            <li key={i}>{renderInline(item, `oli-${key}-${i}`)}</li>
          ))}
        </ol>
      );
      orderedBuffer = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      flushLists();
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushLists();
      const level = heading[1].length;
      const text = heading[2];
      const cls =
        level === 1
          ? "mt-4 mb-2 text-xl font-bold text-slate-900 dark:text-white"
          : level === 2
            ? "mt-4 mb-2 text-lg font-semibold text-slate-900 dark:text-white"
            : "mt-3 mb-1.5 text-base font-semibold text-slate-800 dark:text-slate-100";
      blocks.push(
        <p key={`h-${key++}`} className={cls}>
          {renderInline(text, `h-${key}`)}
        </p>
      );
      continue;
    }
    const ul = /^[-*•]\s+(.*)$/.exec(line.trim());
    if (ul) {
      orderedBuffer.length && flushLists();
      listBuffer.push(ul[1]);
      continue;
    }
    const ol = /^\d+[.)]\s+(.*)$/.exec(line.trim());
    if (ol) {
      listBuffer.length && flushLists();
      orderedBuffer.push(ol[1]);
      continue;
    }
    flushLists();
    blocks.push(
      <p key={`p-${key++}`} className="my-1.5 leading-relaxed">
        {renderInline(line, `p-${key}`)}
      </p>
    );
  }
  flushLists();

  return <div className={className}>{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}
