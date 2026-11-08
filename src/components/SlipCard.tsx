"use client";

import { ChevronLeft, ImageUp } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { Person } from "@/lib/types";
import { SlipUpload, type SlipResult } from "./SlipUpload";
import { Avatar, ICON, Section, Sheet } from "./ui";

export interface SlipChoice {
  /** what the slip endpoint records it under (person id, transfer key or big-bill person key) */
  ref: string;
  person: Pick<Person, "name" | "emoji" | "color">;
  /** e.g. "Mint" or "Mint → Isara" */
  label: ReactNode;
  /** e.g. the amount left to pay */
  detail?: ReactNode;
}

/**
 * "Already paid?" on the bill page itself, so friends see it without opening
 * Pay: "I've paid — upload slip" asks who they are (skipped when only one
 * person still owes), then takes the slip.
 */
export function SlipCard<T extends SlipResult>({
  choices,
  endpoint,
  field,
  currency,
  onAccepted,
  onPick,
  onClose,
  pickTitle = "Who are you?",
}: {
  choices: SlipChoice[];
  endpoint: string;
  field: "personId" | "personKey" | "items";
  currency: string;
  onAccepted: (r: T) => void;
  /** the sheet was closed (e.g. to reload after a slip was accepted) */
  onClose?: () => void;
  /** the question when there's more than one choice */
  pickTitle?: string;
  /** who they said they are (to remember it on this phone) */
  onPick?: (ref: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // Held from the moment they pick: once their slip ticks them, the page drops them from
  // `choices`, and the sheet must still show their result (not someone else, or nothing).
  const [chosen, setChosen] = useState<SlipChoice | null>(null);
  if (choices.length === 0 && !open) return null;

  return (
    <Section title="Already paid?">
      <div className="card space-y-3 p-5">
        <p className="flex items-center gap-2 font-semibold">
          <ImageUp size={20} {...ICON} className="text-accent" aria-hidden /> Upload your transfer slip
        </p>
        <p className="text-[15px] text-ink-2">It&apos;s checked and you&apos;re ticked automatically.</p>
        <button
          type="button"
          className="btn-primary h-12 w-full"
          onClick={() => {
            setOpen(true);
            if (choices.length === 1) {
              setChosen(choices[0]);
              onPick?.(choices[0].ref);
            }
          }}
        >
          <ImageUp size={20} {...ICON} aria-hidden /> I&apos;ve paid — upload slip
        </button>
      </div>

      <Sheet
        open={open}
        onClose={() => {
          setOpen(false);
          setChosen(null);
          onClose?.();
        }}
        title={chosen ? "Upload your slip" : pickTitle}
      >
        {chosen ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 px-1">
              <Avatar person={chosen.person} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{chosen.label}</span>
                {chosen.detail && <span className="block text-[13px] text-ink-2">{chosen.detail}</span>}
              </span>
              {choices.length > 1 && (
                <button type="button" className="btn-ghost min-h-10 px-3 text-[15px]" onClick={() => setChosen(null)}>
                  <ChevronLeft size={18} {...ICON} aria-hidden /> Not you?
                </button>
              )}
            </div>
            <SlipUpload<T> bare endpoint={endpoint} field={field} personRef={chosen.ref} currency={currency} onAccepted={onAccepted} />
          </div>
        ) : (
          <ul className="card rows overflow-hidden">
            {choices.map((c) => (
              <li key={c.ref}>
                <button type="button" className="flex min-h-[60px] w-full items-center gap-3 px-5 py-2 text-left" onClick={() => {
                    setChosen(c);
                    onPick?.(c.ref);
                  }}
                >
                  <Avatar person={c.person} size={36} />
                  <span className="min-w-0 flex-1 truncate font-semibold">{c.label}</span>
                  {c.detail && <span className="text-[15px] text-ink-2">{c.detail}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </Section>
  );
}
