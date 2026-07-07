"use client";

import { IconTrash, IconArrowUp, IconArrowDown, IconPlus } from "@tabler/icons-react";
import { FIELD_TYPES, type FormFieldDraft } from "@/lib/validation/forms";
import { Combobox } from "@/components/ui/Combobox";

const TYPE_LABELS: Record<(typeof FIELD_TYPES)[number], string> = {
  text: "Short text",
  textarea: "Long text",
  email: "Email",
  phone: "Phone",
  number: "Number",
  select: "Multiple choice",
};
const FIELD_TYPE_OPTIONS = FIELD_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] }));

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
    <div className="flex flex-col gap-4">
      {fields.map((field, i) => (
        <div key={i} className="card-elevated rounded-card bg-bg2 p-4">
          <div className="flex items-start gap-2">
            <input
              value={field.label}
              onChange={(e) => updateField(i, { label: e.target.value })}
              placeholder="Question, e.g. Why do you want to join?"
              className="flex-1 rounded-card-sm border border-border2 bg-bg3 px-4 py-2 text-[14px] transition focus:border-green"
            />
            <div className="flex gap-2">
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

          <div className="mt-3 flex flex-wrap items-center gap-4">
            <Combobox
              value={field.field_type}
              onChange={(v) => updateField(i, { field_type: v as FormFieldDraft["field_type"] })}
              options={FIELD_TYPE_OPTIONS}
              placeholder="Question type"
            />
            <label className="flex items-center gap-2 text-[13px] text-text2">
              <input
                type="checkbox"
                checked={field.is_required}
                onChange={(e) => updateField(i, { is_required: e.target.checked })}
                className="accent-green"
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
        className="flex items-center justify-center gap-2 rounded-card-sm border border-dashed border-border2 py-3 text-[13px] font-medium text-text2 transition hover:border-green hover:text-green"
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
    <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
      {options.map((opt, i) => (
        <div key={i} className="flex gap-2">
          <input
            value={opt}
            onChange={(e) => updateOption(i, e.target.value)}
            placeholder={`Option ${i + 1}`}
            className="flex-1 rounded-card-sm border border-border2 bg-bg3 px-4 py-2 text-[13px] transition focus:border-green"
          />
          <button
            type="button"
            onClick={() => removeOption(i)}
            className="text-text3 transition hover:text-pink"
          >
            <IconTrash size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...options, ""])}
        className="self-start text-[12px] font-medium text-green transition hover:text-green-mid"
      >
        + Add option
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
      className="flex h-8 w-8 items-center justify-center rounded-full border border-border2 text-text3 transition hover:border-green hover:text-green disabled:opacity-30"
    >
      {children}
    </button>
  );
}
