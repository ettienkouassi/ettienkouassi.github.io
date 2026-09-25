"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { chatAction, type ChatState } from "@/app/shared/ai-actions";

type Msg = { role: "user" | "assistant"; content: string; tools?: string[] };

/** Rendu Markdown minimal et SÛR : aucun HTML injecté, uniquement du texte React. */
function Rich({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1.5">
      {lines.map((l, i) => {
        const bullet = /^\s*[-*•]\s+/.test(l);
        const heading = /^#{1,4}\s+/.test(l);
        const content = l.replace(/^\s*[-*•]\s+/, "").replace(/^#{1,4}\s+/, "");
        const parts = content.split(/(\*\*[^*]+\*\*)/g).map((p, j) => (p.startsWith("**") && p.endsWith("**") ? <strong key={j}>{p.slice(2, -2)}</strong> : <span key={j}>{p}</span>));
        if (!l.trim()) return <div key={i} className="h-1" />;
        if (heading) return <p key={i} className="font-semibold">{parts}</p>;
        return bullet ? (
          <p key={i} className="flex gap-2 pl-2">
            <span>•</span>
            <span>{parts}</span>
          </p>
        ) : (
          <p key={i}>{parts}</p>
        );
      })}
    </div>
  );
}

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" disabled={pending}>
      {pending ? "Réflexion…" : "Envoyer"}
    </button>
  );
}

function Thinking() {
  const { pending } = useFormStatus();
  return pending ? <div className="animate-pulse text-sm text-slate-500">L&apos;assistant analyse les données…</div> : null;
}

export function Chat({
  kind,
  suggestions,
  initialQuestion,
  history = [],
  conversationId: initialConv,
  disclaimer,
}: {
  kind: "director" | "instructor" | "student";
  suggestions: string[];
  initialQuestion?: string;
  history?: Msg[];
  conversationId?: string;
  disclaimer?: string;
}) {
  const [messages, setMessages] = useState<Msg[]>(history);
  const [state, action] = useActionState<ChatState, FormData>(chatAction, { conversationId: initialConv });
  const [input, setInput] = useState(initialQuestion ?? "");
  const formRef = useRef<HTMLFormElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const lastAt = useRef<number | undefined>(undefined);
  const autoSent = useRef(false);

  useEffect(() => {
    if (state.at && state.at !== lastAt.current && state.answer) {
      lastAt.current = state.at;
      setMessages((m) => [...m, { role: "assistant", content: state.answer!, tools: state.toolsUsed }]);
    }
  }, [state]);
  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [messages]);
  useEffect(() => {
    if (initialQuestion && !autoSent.current) {
      autoSent.current = true;
      formRef.current?.requestSubmit();
    }
  }, [initialQuestion]);

  return (
    <div className="card flex h-[calc(100vh-12rem)] min-h-[28rem] flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="text-center text-sm text-slate-500">
            <p className="text-3xl">🤖</p>
            <p className="mt-2">Posez une question en langage naturel.</p>
            <div className="mx-auto mt-4 flex max-w-2xl flex-wrap justify-center gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:border-brand-300 hover:bg-brand-50"
                  onClick={() => {
                    setInput(s);
                    setTimeout(() => formRef.current?.requestSubmit(), 0);
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${m.role === "user" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-800"}`}>
              {m.role === "assistant" ? <Rich text={m.content} /> : m.content}
              {m.tools && m.tools.length > 0 && <div className="mt-2 text-[10px] uppercase tracking-wide text-slate-400">Sources : données du centre ({[...new Set(m.tools)].join(", ")})</div>}
            </div>
          </div>
        ))}
        {state.error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</div>}
        <div ref={endRef} />
      </div>
      <form
        ref={formRef}
        action={(fd) => {
          const q = String(fd.get("question") ?? "").trim();
          if (!q) return;
          setMessages((m) => [...m, { role: "user", content: q }]);
          setInput("");
          return action(fd);
        }}
        className="border-t border-slate-200 p-3"
      >
        <Thinking />
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="conversationId" value={state.conversationId ?? ""} />
        <div className="flex gap-2">
          <input name="question" value={input} onChange={(e) => setInput(e.target.value)} maxLength={4000} placeholder="Votre question…" className="input" autoComplete="off" />
          <SendButton />
        </div>
        {disclaimer && <p className="mt-2 text-[11px] text-slate-400">{disclaimer}</p>}
      </form>
    </div>
  );
}
