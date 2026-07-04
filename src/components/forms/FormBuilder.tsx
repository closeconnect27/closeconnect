"use client";

import { IconTrash, IconArrowUp, IconArrowDown, IconPlus } from "@tabler/icons-react";
import { FIELD_TYPES, type FormFieldDraft } from "@/lib/validation/forms";

const TYPE_LABELS: Record<(typeof FIELD_TYPES)[number], string> = {
  text: "Short text",
  textarea: "Long text",
  email: "Email",
  phone: "Phone",
  number: "Number",
  select: "Multiple choice",
};

/**
 * Reusable question-list editor for the unified form-field system (SPEC.md
 * Section 1) -- used here for community join-requests, and reused as-is for
 * event registration / ticket-type questions once those pages exist.
 * Purely controlled: caller owns the field array and persists it.
 */
export function FormBuilder({
  fields,
  onChange,
}: {
  fields: FormFieldDraft[];
  onChange: (fields: FormFieldDraft[]) => void;
}) {
  function addField() {
    onChange([...fields, { label: "", field_type: "text", options: [], is_required: true }]);
  }

  function updateField(i: number, patch: Partial<FormFieldDraft>) {
    onChange(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }

  function removeField(i: number) {
    onChange(fields.filter((_, idx) => idx !== i));
  }

  function moveField(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-3">
      {fields.map((field, i) => (
        <div key={i} className="rounded-card border border-border bg-bg2 p-3">
          <div className="flex items-start gap-2">
            <input
              value={field.label}
              onChange={(e) => updateField(i, { label: e.target.value })}
              placeholder="Question, e.g. Why do you want to join?"
              className="flex-1 rounded-card-sm border border-border2 bg-bg3 px-3 py-2 text-[14px]"
            />
            <div className="flex gap-1">
              <IconButton onClick={() => moveField(i, -1)} disabled={i === 0} label="Move up">
                <IconArrowUp size={14} />
              </IconButton>
              <IconButton onClick={() => moveField(i, 1)} disabled={i === fields.length - 1} label="Move down">
                <IconArrowDown size={14} />
              </IconButton>
              <IconButton onClick={() => removeField(i)} label="Remove question">
                <IconTrash size={14} />
              </IconButton>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <select
              value={field.field_type}
              onChange={(e) =>
                updateField(i, { field_type: e.target.value as FormFieldDraft["field_type"] })
              }
              className="rounded-full border border-border2 bg-bg3 px-3 py-1.5 text-[13px]"
            >
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-[13px] text-text2">
              <input
                type="checkbox"
                checked={field.is_required}
                onChange={(e) => updateField(i, { is_required: e.target.checked })}
              />
              Required
            </label>
          </div>

          {field.field_type === "select" && (
            <OptionsEditor
              options={field.options ?? []}
              onChange={(options) => updateField(i, { options })}
            />
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={addField}
        className="flex items-center justify-center gap-1.5 rounded-card-sm border border-dashed border-border2 py-2.5 text-[13px] font-medium text-text2 hover:text-text"
      >
        <IconPlus size={14} />
        Add question
      </button>
    </div>
  );
}

function OptionsEditor({
  options,
  onChange,
}: {
  options: string[];
  onChange: (options: string[]) => void;
}) {
  function updateOption(i: number, value: string) {
    onChange(options.map((o, idx) => (idx === i ? value : o)));
  }
  function removeOption(i: number) {
    onChange(options.filter((_, idx) => idx !== i));
  }
  return (
    <div className="mt-2 flex flex-col gap-1.5 border-t border-border pt-2">
      {options.map((opt, i) => (
        <div key={i} className="flex gap-2">
          <input
            value={opt}
            onChange={(e) => updateOption(i, e.target.value)}
            placeholder={`Option ${i + 1}`}
            className="flex-1 rounded-card-sm border border-border2 bg-bg3 px-2.5 py-1.5 text-[13px]"
          />
          <button type="button" onClick={() => removeOption(i)} className="text-text3 hover:text-pink">
            <IconTrash size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...options, ""])}
        className="self-start text-[12px] font-medium text-green"
      >
        + add option
      </button>
    </div>
  );
}

function IconButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-7 w-7 items-center justify-center rounded-full border border-border2 text-text3 disabled:opacity-30"
    >
      {children}
    </button>
  );
}
