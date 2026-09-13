import { HelpCircle, Send } from "lucide-react";
import { useState } from "react";
import { Markdown } from "./Markdown";

export function QuestionCard({ question, onAnswer, busy }: { question: string; onAnswer: (a: string) => Promise<void>; busy: boolean }) {
  const [text, setText] = useState("");
  return (
    <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-800">
        <HelpCircle size={16} /> エージェントからの質問（回答すると作業が再開されます）
      </div>
      <Markdown text={question} className="text-amber-950" />
      <form
        className="mt-3 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return;
          await onAnswer(text.trim());
          setText("");
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="回答を入力…"
          className="flex-1 resize-y rounded-md border border-amber-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
        <button type="submit" disabled={busy || !text.trim()} className="flex items-center gap-1 rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
          <Send size={14} /> 回答
        </button>
      </form>
    </div>
  );
}
