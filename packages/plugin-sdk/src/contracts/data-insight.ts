import type { JsonValue } from "./manifest.js";

export const DATA_INSIGHT_TEMPLATE_SCHEMA_VERSION = 1 as const;
export const DATA_INSIGHT_AUTHORIZATION_SCHEMA_VERSION = 1 as const;
export const FORMS_ANALYTICS_CATALOG_SCHEMA_VERSION = 1 as const;

export type FormsAnalyticsDimension = {
  field_key: string;
  value_type: "text" | "number" | "boolean" | "timestamp";
  sensitivity: string;
};

export type FormsAnalyticsMeasure = {
  key: string;
  aggregation: "count" | "sum" | "average" | "sum_divide" | "ratio_percent";
  unit: string;
  field_key?: string;
  numerator_field_key?: string;
  denominator_field_key?: string;
  divisor?: number;
  denominator_divisor?: number;
  zero_denominator?: "null";
};

export type FormsAnalyticsDataset = {
  dataset_id: string;
  label: string;
  module_key: string;
  record_type: string;
  parent_record_type?: string;
  dimensions: FormsAnalyticsDimension[];
  measures: FormsAnalyticsMeasure[];
  default_time_field: string | null;
};

export type FormsAnalyticsCatalog = {
  schema_version: typeof FORMS_ANALYTICS_CATALOG_SCHEMA_VERSION;
  metric_contract_version: string;
  datasets: FormsAnalyticsDataset[];
};

export type DataInsightFormsTemplateQuery = {
  key: string;
  dataset_id: string;
  name: string;
  description?: string;
  semantic_query: Record<string, JsonValue>;
  visualization_hint?: string;
};

export type DataInsightPluginTemplateQuery = {
  key: string;
  name: string;
  description?: string;
  plugin_query: {
    saved_query_id: string;
    datasource_id?: string;
  };
  visualization_hint?: string;
};

export type DataInsightTemplateQuery =
  | DataInsightFormsTemplateQuery
  | DataInsightPluginTemplateQuery;

export type DataInsightTemplateWidgetType =
  | "metric"
  | "table"
  | "text"
  | "bar"
  | "line"
  | "area"
  | "pie"
  | "donut"
  | "scatter";

export type DataInsightTemplateWidget = {
  key: string;
  type: DataInsightTemplateWidgetType;
  title: string;
  description?: string;
  query_key?: string;
  text_content?: string;
  config?: Record<string, JsonValue>;
  position?: Record<string, JsonValue>;
};

export type DataInsightTemplateAuthorization = {
  /** Stable plugin-owned policy key; presentation labels must not be used. */
  policy_key: string;
  /** Plugin-owned presentation label for generic host administration surfaces. */
  label?: string;
  /** Optional plugin-owned explanation of the policy's intended audience/scope. */
  description?: string;
  /** Stable plugin-owned references grouped by bounded, plugin-defined namespaces. */
  references: Readonly<Record<string, readonly string[]>>;
};

export type DataInsightDashboardTemplate = {
  id: string;
  title: string;
  description?: string;
  suggested_questions?: string[];
  layout?: Record<string, JsonValue>;
  presentation?: { show_date_range?: boolean };
  authorization?: DataInsightTemplateAuthorization;
  queries: DataInsightTemplateQuery[];
  widgets: DataInsightTemplateWidget[];
};

/**
 * Host-attested authorization supplied only after the host revalidates the
 * actor, tenant, dashboard, subject membership, and plugin-declared references.
 * A plugin declaration never creates access by itself.
 */
export type DataInsightAuthorizationContext = {
  schemaVersion: typeof DATA_INSIGHT_AUTHORIZATION_SCHEMA_VERSION;
  mode: "dashboard" | "dashboard_chat" | "resource_action";
  policyKey: string;
  dashboardId: string;
  subject: Readonly<{ type: "group"; id: string }>;
  allowedReferences: Readonly<Record<string, readonly string[]>>;
};

export type DataInsightDashboardTemplateCatalog = {
  schema_version: typeof DATA_INSIGHT_TEMPLATE_SCHEMA_VERSION;
  templates: DataInsightDashboardTemplate[];
};
