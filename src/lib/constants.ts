// Global Constants for the Student Voice Platform

/**
 * CORE_CATEGORIES
 * A baseline set of categories that the AI Data Scientist attempts to discover 
 * across ALL units to ensure standard cross-departmental correlation capabilities 
 * like Sentiment Bar charts and Scatter plots.
 */
export const CORE_CATEGORIES = [
    {
        name: "Response Speed & Timeliness",
        description: "How quickly the unit responds to emails, inquiries, tickets, or completes requested services."
    },
    {
        name: "Staff Professionalism & Attitude",
        description: "The demeanor, friendliness, and helpfulness of the staff during interactions."
    },
    {
        name: "Clarity of Information",
        description: "How clear, accurate, and accessible the unit's policies, guidelines, and communications are."
    },
    {
        name: "Accessibility",
        description: "How easy it is to reach the unit, book appointments, or access physical/digital locations."
    }
];

/**
 * MANDATORY_CATEGORIES
 * These categories MUST always be present in every unit's taxonomy.
 * They are seeded before AI discovery and cannot be deleted by the user.
 */
export const MANDATORY_CATEGORIES = [
    {
        name: "Staff Service & Attitude",
        description: "Feedback about staff professionalism, friendliness, helpfulness, and the quality of interpersonal interactions.",
        keywords: ["staff", "attitude", "friendly", "helpful", "rude", "service", "responsive", "professional"]
    },
    {
        name: "Service & Response Speed",
        description: "Feedback about how quickly the unit responds to requests, emails, inquiries, or completes required services.",
        keywords: ["slow", "fast", "response", "speed", "waiting", "timely", "delay", "quick"]
    },
    {
        name: "Others",
        description: "Miscellaneous feedback that does not fit into any other specific category.",
        keywords: []
    }
];
