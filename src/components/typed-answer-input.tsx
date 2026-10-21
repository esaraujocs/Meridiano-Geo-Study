import { useEffect, useRef } from "react";

/** Enter com o campo vazio = "não sei" (20/10/2026, pedido do Enzo: ele digitava uma letra e dava Enter para pular, "sem poluir a interface"),
 *  ignorado nos primeiros instantes da pergunta: o Enter que confirmou a anterior não pode pular a nova. */
export const GIVE_UP_GRACE_MS = 700;
import { matchTypedAnswer } from "../domain/typed-answer";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
  /** Enter com o campo vazio: desistir da pergunta (conta como erro e segue). */
  onGiveUp?: () => void;
  answers?: readonly string[];
  ambiguitySafe?: boolean;
  disabled?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  "aria-label": string;
  className?: string;
  autoFocus?: boolean;
};

export function TypedAnswerInput({ value, onChange, onCommit, onGiveUp, answers = [], ambiguitySafe = false, disabled, inputRef, ...props }: Props) {
  const committed = useRef(false);
  const shownAt = useRef(Date.now());
  useEffect(() => { if (!value) committed.current = false; }, [value]);
  const commit = (next: string) => {
    if (!next.trim() || disabled || committed.current) return;
    committed.current = true;
    onCommit(next);
  };
  return <input {...props} ref={inputRef} value={value} disabled={disabled} onChange={(event) => {
    const next = event.target.value;
    onChange(next);
    const match = matchTypedAnswer(next, answers, { requireUnambiguous: ambiguitySafe });
    if (match.autoCommit) commit(next);
  }} onKeyDown={(event) => {
    if (event.key !== "Enter" || !onGiveUp || value.trim() || disabled || committed.current) return;
    event.preventDefault();
    if (Date.now() - shownAt.current < GIVE_UP_GRACE_MS) return;
    committed.current = true;
    onGiveUp();
  }} onBlur={() => { commit(value); }} />;
}