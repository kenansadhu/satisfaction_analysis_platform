"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Trash2, ArrowRight, BarChart3, Calendar, Plus, Users, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { PageShell, PageHeader } from "@/components/layout/PageShell";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Survey } from "@/types";

export default function SurveysPage() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  useEffect(() => {
    fetchSurveys();
  }, []);

  async function fetchSurveys() {
    setIsLoading(true);
    const { data: surveyList, error } = await supabase
      .from('surveys')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      setIsLoading(false);
      return;
    }

    const enrichedSurveys = await Promise.all(surveyList.map(async (s) => {
      const { count } = await supabase
        .from('respondents')
        .select('*', { count: 'exact', head: true })
        .eq('survey_id', s.id);
      return {
        id: s.id,
        title: s.title,
        created_at: s.created_at,
        respondents: [{ count: count || 0 }] // Match the type definition
      };
    }));

    setSurveys(enrichedSurveys);
    setIsLoading(false);
  }

  const handleDelete = async (id: number) => {
    const { error } = await supabase.from('surveys').delete().eq('id', id);
    if (error) toast.error("Error deleting: " + error.message);
    else fetchSurveys();
    setDeleteTarget(null);
  };

  return (
    <PageShell>
      <PageHeader
        title="Surveys"
        description="Manage your analysis projects and track historical data."
        backHref="/"
        backLabel="Home"
        actions={
          <Link href="/import">
            <Button className="gap-2 bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-600/25 border border-blue-500/50">
              <Plus className="w-4 h-4" /> New Import
            </Button>
          </Link>
        }
      />

      <div className="max-w-7xl mx-auto px-8 py-10 space-y-8">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex flex-col space-y-3">
                <Skeleton className="h-[200px] w-full rounded-xl" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-[80%]" />
                </div>
              </div>
            ))}
          </div>
        ) : surveys.length === 0 ? (
          <EmptyState
            title="No surveys found"
            description="Get started by importing your first CSV file to begin the AI analysis."
            icon={FolderOpen}
            actionLabel="Create First Survey"
            onAction={() => window.location.href = "/import"}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {surveys.map((survey) => (
              <Card key={survey.id} className="group hover:shadow-lg transition-all duration-200 border-slate-200 hover:border-blue-300 overflow-hidden hover:-translate-y-0.5">
                <div className="h-1 bg-gradient-to-r from-blue-500 to-indigo-500" />
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <CardTitle className="text-lg font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                        {survey.title}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-1 text-xs">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(survey.created_at), "MMM d, yyyy")}
                      </CardDescription>
                    </div>
                    <Badge variant="secondary" className="bg-slate-50 text-slate-600">
                      #{survey.id}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 text-slate-600 bg-slate-50 p-3 rounded-md border border-slate-100">
                    <Users className="w-5 h-5 text-blue-500" />
                    <span className="font-semibold text-lg">
                      {survey.respondents?.[0]?.count?.toLocaleString() || 0}
                    </span>
                    <span className="text-sm text-slate-400">Respondents</span>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-between border-t bg-slate-50/50 pt-4">
                  <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteTarget(survey.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  <Link href={`/surveys/${survey.id}`}>
                    <Button size="sm" variant="outline" className="gap-2 group-hover:border-blue-300 group-hover:text-blue-600">
                      Analyze Project <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Survey?"
        description="This will permanently delete all student data and analysis for this survey. This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
      />
    </PageShell>
  );
}