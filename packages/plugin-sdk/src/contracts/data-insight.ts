import type { JsonValue } from "./manifest.js";

export const DATA_INSIGHT_TEMPLATE_SCHEMA_VERSION = 1 as const;

export type DataInsightTemplateQuery = {
  key: string;
  dataset_id: string;
  name: string;
  description?: string;
  semantic_query: Record<string, JsonValue>;
  visualization_hint?: string;
};

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

export type DataInsightDashboardTemplate = {
  id: string;
  title: string;
  description?: string;
  suggested_questions?: string[];
  layout?: Record<string, JsonValue>;
  queries: DataInsightTemplateQuery[];
  widgets: DataInsightTemplateWidget[];
};

export type DataInsightDashboardTemplateCatalog = {
  schema_version: typeof DATA_INSIGHT_TEMPLATE_SCHEMA_VERSION;
  templates: DataInsightDashboardTemplate[];
};
