import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Helper: paginate through all rows (Supabase default limit = 1000)
async function fetchAll(queryFactory: () => any, label?: string): Promise<any[]> {
    const PAGE = 1000;
    let all: any[] = [];
    let from = 0;
    while (true) {
        const { data, error } = await queryFactory().range(from, from + PAGE - 1);
        if (error) {
            console.error(`[fetchAll${label ? ` ${label}` : ''}] error:`, error.message);
            break;
        }
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
    }
    return all;
}

export async function GET(req: NextRequest) {
    const surveyId = req.nextUrl.searchParams.get("surveyId");
    if (!surveyId) {
        return NextResponse.json({ error: "surveyId required" }, { status: 400 });
    }

    // 1. Survey info
    const { data: survey } = await supabase
        .from('surveys')
        .select('id, title, year, description')
        .eq('id', surveyId)
        .single();

    if (!survey) {
        return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }

    // 2. Respondents (paginated — 8k+ rows, but only ~9 pages)
    const respList = await fetchAll(() =>
        supabase.from('respondents').select('id, location, faculty, study_program').eq('survey_id', surveyId)
    );

    // Campus participation
    const campusMap = new Map<string, number>();
    respList.forEach(r => {
        const loc = r.location || "Unknown";
        campusMap.set(loc, (campusMap.get(loc) || 0) + 1);
    });
    const campusParticipation = Array.from(campusMap.entries())
        .map(([campus, count]) => ({ campus, respondents: count }))
        .sort((a, b) => b.respondents - a.respondents);

    // Prodi participation
    const prodiMap = new Map<string, number>();
    respList.forEach(r => {
        const prodi = r.study_program || "Unknown";
        prodiMap.set(prodi, (prodiMap.get(prodi) || 0) + 1);
    });
    const prodiParticipation = Array.from(prodiMap.entries())
        .map(([prodi, count]) => ({ prodi, respondents: count }))
        .sort((a, b) => b.respondents - a.respondents);

    // 3. Prodi enrollment (for response rate per study program)
    const { data: prodiEnroll } = await supabase
        .from('prodi_enrollment')
        .select('study_program, faculty, student_count')
        .eq('survey_id', parseInt(surveyId));

    const prodiEnrollMap = new Map((prodiEnroll || []).map(e => [e.study_program, e]));
    const totalEnrolled = (prodiEnroll || []).reduce((sum: number, e: any) => sum + (e.student_count || 0), 0);

    const prodiParticipationEnriched = prodiParticipation.map(pp => {
        const enrollment = prodiEnrollMap.get(pp.prodi);
        return {
            ...pp,
            faculty: enrollment?.faculty || null,
            enrolled: enrollment?.student_count || null,
            response_rate: enrollment?.student_count ? parseFloat((pp.respondents / enrollment.student_count * 100).toFixed(1)) : null,
        };
    });

    // 4. Organization units
    const { data: units } = await supabase
        .from('organization_units')
        .select('id, name, short_name')
        .order('name');

    // 5. Aggregated data
    // 5a. Quantitative scores — with lazy caching (scores are immutable after import)
    const respIds = respList.map((r: any) => r.id);
    const respLocationMap = new Map<number, string>();
    respList.forEach((r: any) => respLocationMap.set(r.id, r.location || "Unknown"));

    type ScoreEntry = { avg: number; count: number };
    const unitScores = new Map<number, Map<string, ScoreEntry>>();
    const unitOverall = new Map<number, { sum: number; count: number }>();
    const campusScoreAccum = new Map<string, { avg: number; count: number }>();

    // Try cache first
    const { data: cachedScores } = await supabase
        .from('survey_quant_cache')
        .select('unit_id, campus, avg_score, score_count')
        .eq('survey_id', parseInt(surveyId));

    if (cachedScores && cachedScores.length > 0) {
        // Cache hit — populate maps from cache (~40-60 rows, instant)
        for (const row of cachedScores) {
            const unitId = row.unit_id;
            const campus = row.campus;
            const avg = parseFloat(row.avg_score);
            const count = row.score_count;

            if (!unitScores.has(unitId)) unitScores.set(unitId, new Map());
            unitScores.get(unitId)!.set(campus, { avg, count });
            campusScoreAccum.set(`${unitId}__${campus}`, { avg, count });

            if (!unitOverall.has(unitId)) unitOverall.set(unitId, { sum: 0, count: 0 });
            const overall = unitOverall.get(unitId)!;
            overall.sum += avg * count;
            overall.count += count;
        }
    } else {
        // Cache miss — compute from raw data, then store
        // Uses same approach as ComprehensiveDashboard: group by source_column,
        // exclude binary (0/1) columns by checking max value.
        type ColumnAccum = {
            maxScore: number;
            campusData: Map<string, { sum: number; count: number }>;
        };
        const unitColumnAccum = new Map<number, Map<string, ColumnAccum>>();

        const CHUNK = 400;
        for (let i = 0; i < respIds.length; i += CHUNK) {
            const chunk = respIds.slice(i, i + CHUNK);
            const rows = await fetchAll(() =>
                supabase.from('raw_feedback_inputs')
                    .select('respondent_id, target_unit_id, source_column, numerical_score')
                    .in('respondent_id', chunk)
                    .eq('is_quantitative', true)
                    .not('numerical_score', 'is', null),
                'quant-scores'
            );
            for (const row of rows) {
                const unitId = row.target_unit_id;
                if (!unitId) continue;
                const score = parseFloat(row.numerical_score);
                if (isNaN(score)) continue;
                const col = row.source_column || '_default';
                const campus = respLocationMap.get(row.respondent_id) || "Unknown";

                if (!unitColumnAccum.has(unitId)) unitColumnAccum.set(unitId, new Map());
                const colMap = unitColumnAccum.get(unitId)!;
                if (!colMap.has(col)) colMap.set(col, { maxScore: 0, campusData: new Map() });
                const colAcc = colMap.get(col)!;
                if (score > colAcc.maxScore) colAcc.maxScore = score;

                if (!colAcc.campusData.has(campus)) colAcc.campusData.set(campus, { sum: 0, count: 0 });
                const entry = colAcc.campusData.get(campus)!;
                entry.sum += score;
                entry.count += 1;
            }
        }

        // Phase 2: Aggregate, excluding binary (0/1) columns
        for (const [unitId, colMap] of unitColumnAccum) {
            for (const [_col, colAcc] of colMap) {
                if (colAcc.maxScore <= 1) continue;

                if (!unitScores.has(unitId)) unitScores.set(unitId, new Map());
                for (const [campus, data] of colAcc.campusData) {
                    if (!unitScores.get(unitId)!.has(campus)) {
                        unitScores.get(unitId)!.set(campus, { avg: 0, count: 0 });
                    }
                    const existing = unitScores.get(unitId)!.get(campus)!;
                    const newCount = existing.count + data.count;
                    existing.avg = (existing.avg * existing.count + data.sum) / newCount;
                    existing.count = newCount;

                    campusScoreAccum.set(`${unitId}__${campus}`, unitScores.get(unitId)!.get(campus)!);
                    if (!unitOverall.has(unitId)) unitOverall.set(unitId, { sum: 0, count: 0 });
                }
            }
        }

        // Recompute unitOverall from unitScores
        for (const [unitId, campusMap] of unitScores) {
            let sum = 0, count = 0;
            for (const [_, entry] of campusMap) {
                sum += entry.avg * entry.count;
                count += entry.count;
            }
            unitOverall.set(unitId, { sum, count });
        }

        // Store to cache (fire-and-forget, don't block response)
        const cacheRows: any[] = [];
        for (const [unitId, campusMap] of unitScores) {
            for (const [campus, entry] of campusMap) {
                cacheRows.push({
                    survey_id: parseInt(surveyId),
                    unit_id: unitId,
                    campus,
                    avg_score: parseFloat(entry.avg.toFixed(3)),
                    score_count: entry.count,
                });
            }
        }
        if (cacheRows.length > 0) {
            supabase.from('survey_quant_cache')
                .upsert(cacheRows, { onConflict: 'survey_id,unit_id,campus' })
                .then(({ error }) => {
                    if (error) console.error('[cache] write error:', error.message);
                    else console.log(`[cache] wrote ${cacheRows.length} rows for survey ${surveyId}`);
                });
        }
    }

    // 5b. Qualitative summary: COUNT grouped by unit × category × sentiment (~200 rows)
    const { data: qualAgg, error: qualErr } = await supabase.rpc('get_qual_summary_by_unit', {
        p_survey_id: parseInt(surveyId),
    });
    if (qualErr) console.error('[qual RPC] error:', qualErr.message);

    // 6. Categories lookup
    const { data: categories } = await supabase
        .from('analysis_categories')
        .select('id, name, unit_id');

    const catMap = new Map((categories || []).map(c => [c.id, c]));

    // Build qualitative data from RPC result
    type QualData = {
        positive: number;
        negative: number;
        neutral: number;
        suggestions: number;
        total: number;
        categories: Map<string, { positive: number; negative: number; neutral: number }>;
    };
    const unitQualData = new Map<number, QualData>();

    for (const row of (qualAgg || [])) {
        const unitId = row.target_unit_id;
        if (unitId == null) continue;
        const cnt = parseInt(row.cnt);

        if (!unitQualData.has(unitId)) {
            unitQualData.set(unitId, {
                positive: 0, negative: 0, neutral: 0, suggestions: 0, total: 0,
                categories: new Map(),
            });
        }
        const data = unitQualData.get(unitId)!;
        data.total += cnt;
        if (row.sentiment === "Positive") data.positive += cnt;
        else if (row.sentiment === "Negative") data.negative += cnt;
        else data.neutral += cnt;
        if (row.is_suggestion) data.suggestions += cnt;

        // Category breakdown
        const cat = catMap.get(row.category_id);
        if (cat) {
            if (!data.categories.has(cat.name)) {
                data.categories.set(cat.name, { positive: 0, negative: 0, neutral: 0 });
            }
            const catData = data.categories.get(cat.name)!;
            if (row.sentiment === "Positive") catData.positive += cnt;
            else if (row.sentiment === "Negative") catData.negative += cnt;
            else catData.neutral += cnt;
        }
    }

    // Build response
    const allCampuses = [...new Set(campusParticipation.map(c => c.campus))];

    const unitReports = (units || []).map(unit => {
        const overallEntry = unitOverall.get(unit.id);
        const campusEntries = unitScores.get(unit.id);
        const qualData = unitQualData.get(unit.id);

        const campusBreakdown = allCampuses.map(campus => {
            const entry = campusEntries?.get(campus);
            return {
                campus,
                average: entry ? parseFloat(entry.avg.toFixed(2)) : null,
                count: entry?.count || 0,
            };
        });

        const categoryBreakdown = qualData
            ? Array.from(qualData.categories.entries())
                .map(([name, counts]) => ({
                    name,
                    positive: counts.positive,
                    negative: counts.negative,
                    neutral: counts.neutral,
                    total: counts.positive + counts.negative + counts.neutral,
                }))
                .sort((a, b) => b.total - a.total)
            : [];

        return {
            unit_id: unit.id,
            unit_name: unit.name,
            short_name: unit.short_name,
            satisfaction_index: overallEntry
                ? parseFloat((overallEntry.sum / overallEntry.count).toFixed(2))
                : null,
            score_count: overallEntry?.count || 0,
            campus_scores: campusBreakdown,
            qualitative: qualData ? {
                total: qualData.total,
                positive: qualData.positive,
                negative: qualData.negative,
                neutral: qualData.neutral,
                suggestions: qualData.suggestions,
                positive_pct: qualData.total > 0 ? parseFloat((qualData.positive / qualData.total * 100).toFixed(1)) : 0,
                negative_pct: qualData.total > 0 ? parseFloat((qualData.negative / qualData.total * 100).toFixed(1)) : 0,
                categories: categoryBreakdown,
            } : null,
        };
    }).filter(u => u.satisfaction_index !== null || (u.qualitative && u.qualitative.total > 0));

    // Global satisfaction index
    let globalSum = 0, globalCount = 0;
    for (const entry of unitOverall.values()) {
        globalSum += entry.sum;
        globalCount += entry.count;
    }

    // Per-campus satisfaction index
    const campusSatMap = new Map<string, { sum: number; count: number }>();
    for (const [key, acc] of campusScoreAccum) {
        const campus = key.split('__')[1];
        if (!campusSatMap.has(campus)) campusSatMap.set(campus, { sum: 0, count: 0 });
        const entry = campusSatMap.get(campus)!;
        entry.sum += acc.avg * acc.count;
        entry.count += acc.count;
    }
    const campusSatisfaction = Array.from(campusSatMap.entries()).map(([campus, entry]) => ({
        campus,
        satisfaction_index: parseFloat((entry.sum / entry.count).toFixed(2)),
    }));

    return NextResponse.json({
        survey,
        totalRespondents: respList.length,
        totalEnrolled,
        responseRate: totalEnrolled > 0 ? parseFloat((respList.length / totalEnrolled * 100).toFixed(1)) : null,
        campusParticipation,
        prodiParticipation: prodiParticipationEnriched.slice(0, 100),
        globalSatisfactionIndex: globalCount > 0 ? parseFloat((globalSum / globalCount).toFixed(2)) : null,
        campusSatisfaction,
        campuses: allCampuses,
        units: unitReports,
    });
}
