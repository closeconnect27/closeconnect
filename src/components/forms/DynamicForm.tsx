"use client";

import type { FormField } from "@/lib/queries/membership";

const inputClass =
  "rounded-card-sm border border-border2 bg-bg3 px-4 py-3 text-[14px] transition focus:border-green";

/**
 * Renders a set of form_fields as actual inputs and collects answers keyed
 * by field id -- the response-collecting counterpart to FormBuilder (which
 * defines the questions). Also reusable for event registration once that
 * page exists (SPEC.md Section 1's unified form system).
 */
export function DynamicForm({
  fields,
  values,
  onChange,
}: {
  fields: FormField[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
}) {
  function setValue(fieldId: string, value: string) {
    onChange({ ...values, [fieldId]: value });
  }

  return (
    <div className="flex flex-col gap-4">
      {fields.map((field) => (
        <label key={field.id} className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-text">
            {field.label}
            {field.is_required && <span className="text-pink"> *</span>}
          </span>
          {field.field_type === "textarea" ? (
            <textarea
              required={field.is_required}
              value={values[field.id] ?? ""}
              onChange={(e) => setValue(field.id, e.target.value)}
              rows={3}
              className={inputClass}
            />
          ) : field.field_type === "select" ? (
            <select
              required={field.is_required}
              value={values[field.id] ?? ""}
              onChange={(e) => setValue(field.id, e.target.value)}
              className={inputClass}
            >
              <option value="" disabled>
                Choose one
              </option>
              {(field.options ?? []).map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={
                field.field_type === "email"
                  ? "email"
                  : field.field_type === "phone"
                    ? "tel"
                    : field.field_type === "number"
                      ? "number"
                      : "text"
              }
              required={field.is_required}
              value={values[field.id] ?? ""}
              onChange={(e) => setValue(field.id, e.target.value)}
              className={inputClass}
            />
          )}
        </label>
      ))}
    </div>
  );
}
