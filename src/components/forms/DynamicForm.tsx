"use client";

import type { FormField } from "@/lib/queries/membership";
import { Combobox } from "@/components/ui/Combobox";

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
      {fields.map((field) =>
        // A plain div, not <label> -- the select variant renders a button
        // (Combobox), and wrapping more than one focusable element in a
        // <label> gives browsers ambiguous click-to-activate behavior,
        // same reasoning as the create/edit forms' own Field wrapper.
        field.field_type === "select" ? (
          <div key={field.id} className="flex flex-col gap-2">
            <span className="text-[13px] font-medium text-text">
              {field.label}
              {field.is_required && <span className="text-pink"> *</span>}
            </span>
            <Combobox
              value={values[field.id] ?? ""}
              onChange={(v) => setValue(field.id, v)}
              options={(field.options ?? []).map((opt) => ({ value: opt, label: opt }))}
              placeholder="Choose one"
            />
          </div>
        ) : (
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
        ),
      )}
    </div>
  );
}
