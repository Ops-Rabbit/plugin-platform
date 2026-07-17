export const FORM_STARTER_PACK_FORMAT_VERSION = 1 as const;

export const FORM_FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "date",
  "boolean",
  "select",
  "attachment",
] as const;
export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

export const FORM_ICON_KEYS = [
  "activity",
  "alert_triangle",
  "bar_chart",
  "book_open",
  "building",
  "check",
  "headset",
  "mail",
  "message_square",
  "search",
  "variable",
  "waves",
] as const;
export type FormIconKey = (typeof FORM_ICON_KEYS)[number];

export interface FormFieldOption {
  value: string;
  label: string;
}

export interface FormFieldDefinition {
  key: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  options?: FormFieldOption[];
  listColumn?: boolean;
  summaryField?: boolean;
  attachmentMultiple?: boolean;
}

export interface FormSectionDefinition {
  key: string;
  label: string;
  description?: string;
  fieldKeys: string[];
}

export interface FormActionDefinition {
  key: string;
  label: string;
  kind: "save_draft" | "submit";
}

export interface FormSchemaDefinition {
  fields: FormFieldDefinition[];
  sections: FormSectionDefinition[];
  actions: FormActionDefinition[];
}

export interface FormListConfig {
  columns: Array<{ fieldKey: string; label: string }>;
  searchFields?: string[];
  filterFields?: string[];
  workspace?: {
    showOnLanding: boolean;
    defaultOnLanding: boolean;
  };
  pageSize?: number;
  defaultSort: "updated_at_desc";
}

export interface FormStarterDefinition {
  starterKey: string;
  title: string;
  description: string;
  recordType: string;
  badge: string;
  icon: FormIconKey;
  schema: FormSchemaDefinition;
  listConfig: FormListConfig;
}

export interface FormStarterPackAsset {
  formatVersion: typeof FORM_STARTER_PACK_FORMAT_VERSION;
  moduleKey: string;
  starters: FormStarterDefinition[];
}

export interface PluginFormStarterPackReference {
  moduleKey: string;
  path: `./forms/${string}.json`;
}
