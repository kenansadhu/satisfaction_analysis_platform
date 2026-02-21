/**
 * Shared TypeScript types for the Student Voice Platform.
 * Replace `any` with these types throughout the codebase.
 */

// --- Database Models ---

export interface OrganizationUnit {
    id: number;
    name: string;
    short_name?: string;
    description?: string;
    analysis_context?: string;
    analysis_status?: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
}

export interface Survey {
    id: number;
    title: string;
    created_at: string;
    respondents?: { count: number }[];
}

export interface Category {
    id: number;
    name: string;
    description: string;
    keywords?: string[];
    unit_id: number;
}

export interface Subcategory {
    id: number;
    name: string;
    description?: string;
    category_id: number;
}

export interface RawFeedbackInput {
    id: number;
    raw_text: string;
    source_column: string;
    target_unit_id: number;
    respondent_id?: number;
    is_quantitative: boolean;
    requires_analysis: boolean;
    numerical_score?: number;
}

export interface FeedbackSegment {
    id: number;
    raw_input_id: number;
    segment_text: string;
    sentiment: Sentiment;
    category_id: number | null;
    subcategory_id?: number | null;
    is_suggestion: boolean;
    related_unit_ids?: number[];
}

// --- Enums ---

export type Sentiment = "Positive" | "Negative" | "Neutral";

export type ColumnType = "SCORE" | "CATEGORY" | "TEXT" | "IGNORE";

export type ColumnRule = "LIKERT" | "BOOLEAN" | "TEXT_SCALE";

// --- AI Response Types ---

export interface ColumnMapping {
    unit_id: string;
    type: ColumnType;
    rule?: ColumnRule;
}

export interface IdentityMapping {
    location: string[];
    faculty: string[];
    major: string[];
    year: string[];
}

export interface DiscoveredCategory {
    name: string;
    description: string;
    keywords: string[];
}

export interface AnalysisSegment {
    text: string;
    category_name: string;
    sentiment: Sentiment;
    is_suggestion: boolean;
    related_unit_name: string | null;
}

export interface AnalysisResult {
    raw_input_id: number;
    segments: AnalysisSegment[];
}

export interface BatchResult {
    raw_input_id: number;
    segment_text: string;
    sentiment: Sentiment;
    category: string;
    sub_category: string;
    is_suggestion: boolean;
}

export interface ChartBlueprint {
    id: string;
    type: "BAR" | "PIE" | "LINE" | "SCATTER" | "HORIZONTAL_BAR";
    title: string;
    description: string;
    xKey: string;
    yKey: string;
    yKeys?: string[];
    aggregation: "COUNT" | "AVG" | "SUM";
}

// --- UI State Types ---

export interface UnitStats {
    unit_id: number;
    unit_name: string;
    analysis_status: string;
    stats: {
        total_rows: number;
        text_cols: number;
        score_cols: number;
        category_cols: number;
        analyzed_segments: number;
    };
}
