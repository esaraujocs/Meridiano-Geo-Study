import { useEffect, useRef } from "react";
import { matchTypedAnswer } from "../domain/typed-answer";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
  answers?: readonly string[];
  ambiguitySafe?: boolean;
  disabled?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  "aria-label": string;
  className?: string;
  autoFocus?: boolean;
};

export function TypedAnswerInput({ value, onChange, onCommit, answers = [], ambiguitySafe = false, disabled, inputRef, ...props }: Props) {
  const committed = useRef(false);
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
  }} onBlur={() => { commit(value); }} />;
}