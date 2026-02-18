"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, ArrowRight, BarChart3, Calendar, Plus, Loader2 } from "lucide-react";
import { format } from "date-fns"; // You might need to install: npm install date-fns

type Survey = {
  id: number;
  title: string;
  created_at: string;
  respondent_count?: number; // We will fetch this manually
};

export default function DashboardPage() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load Surveys
  useEffect(() => {
    fetchSurveys();
  }, []);

  async function fetchSurveys() {
    setIsLoading(true);
    // 1. Get Surveys
    const { data: surveyList, error } = await supabase
      .from('surveys')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      setIsLoading(false);
      return;
    }

    // 2. Get Respondent Counts for each (A bit manual but accurate)
    const enrichedSurveys = await Promise.all(surveyList.map(async (s) => {
      const { count } = await supabase
        .from('respondents')
        .select('*', { count: 'exact', head: true })
        .eq('survey_id', s.id);
      return { ...s, respondent_count: count || 0 };
    }));

    setSurveys(enrichedSurveys);
    setIsLoading(false);
  }

  // Delete Functionality
  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure? This will delete all student data and analysis for this survey permanently.")) return;

    const { error } = await supabase.from('surveys').delete().eq('id', id);
    if (error) alert("Error deleting: " + error.message);
    else fetchSurveys(); // Refresh list
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Survey Dashboard</h1>
            <p className="text-slate-500 mt-1">Manage your analysis projects and track historical data.</p>
          </div>
          <Link href="/import">
            <Button className="bg-blue-600 hover:bg-blue-700 shadow-sm">
              <Plus className="w-4 h-4 mr-2" /> New Import
            </Button>
          </Link>
        </div>

        {/* Survey Grid */}
        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-slate-300" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {surveys.map((survey) => (
              <Card key={survey.id} className="group hover:shadow-md transition-all border-slate-200">
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
                    <Badge variant="secondary" className="bg-slate-100 text-slate-600">
                        #{survey.id}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 text-slate-600 bg-slate-50 p-3 rounded-md border border-slate-100">
                    <BarChart3 className="w-5 h-5 text-blue-500" />
                    <span className="font-semibold text-lg">{survey.respondent_count?.toLocaleString()}</span>
                    <span className="text-sm text-slate-400">Respondents</span>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-between border-t bg-slate-50/50 pt-4">
                  <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(survey.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  <Link href={`/dashboard/${survey.id}`}>
                    <Button size="sm" variant="outline" className="gap-2 group-hover:border-blue-300">
                      Open Analysis <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </CardFooter>
              </Card>
            ))}

            {/* Empty State */}
            {surveys.length === 0 && (
              <div className="col-span-full py-16 text-center border-2 border-dashed border-slate-200 rounded-lg bg-white">
                <div className="mx-auto w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                    <BarChart3 className="w-6 h-6 text-slate-400" />
                </div>
                <h3 className="text-lg font-medium text-slate-900">No surveys found</h3>
                <p className="text-slate-500 mb-6 max-w-sm mx-auto">Get started by importing your first CSV file to begin the AI analysis.</p>
                <Link href="/import">
                    <Button>Create First Survey</Button>
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}