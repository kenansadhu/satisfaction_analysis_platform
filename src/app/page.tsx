import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, BarChart3, Settings, Upload, ArrowRight, Database, Users } from "lucide-react";

export const revalidate = 0; // Ensure fresh data on every load

export default async function HomePage() {
  // 1. Fetch Surveys
  const { data: surveys } = await supabase
    .from('surveys')
    .select('*, respondents(count)')
    .order('created_at', { ascending: false });

  // 2. Fetch Stats (Optional, just for "Alive" feel)
  const { count: totalUnits } = await supabase.from('organization_units').select('*', { count: 'exact', head: true });

  return (
    <div className="min-h-screen bg-slate-50 font-sans">

      {/* --- HERO SECTION --- */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-8 py-12">
          <div className="flex justify-between items-center">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Student Voice Analytics</h1>
              <p className="text-slate-500 text-lg">AI-Powered Feedback Processing Platform</p>
            </div>
            <div className="flex gap-3">
              <Link href="/units">
                <Button variant="outline" className="gap-2">
                  <Settings className="w-4 h-4" /> Manage Units
                </Button>
              </Link>
              <Link href="/import">
                <Button className="gap-2 bg-blue-600 hover:bg-blue-700 shadow-lg">
                  <Upload className="w-4 h-4" /> Import New Survey
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* --- MAIN CONTENT --- */}
      <div className="max-w-6xl mx-auto px-8 py-12 space-y-10">

        {/* Quick Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-none shadow-md">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-full"><Database className="w-6 h-6 text-white" /></div>
              <div><div className="text-2xl font-bold">{surveys?.length || 0}</div><div className="text-blue-100 text-sm">Active Surveys</div></div>
            </CardContent>
          </Card>
          <Card className="bg-white border-slate-200 shadow-sm">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 bg-purple-100 rounded-full"><Users className="w-6 h-6 text-purple-600" /></div>
              <div>
                {/* Summing up respondents from all surveys */}
                <div className="text-2xl font-bold text-slate-800">
                  {surveys?.reduce((acc, s) => acc + (s.respondents?.[0]?.count || 0), 0).toLocaleString()}
                </div>
                <div className="text-slate-500 text-sm">Total Respondents Processed</div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white border-slate-200 shadow-sm">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 bg-slate-100 rounded-full"><Building2 className="w-6 h-6 text-slate-600" /></div>
              <div><div className="text-2xl font-bold text-slate-800">{totalUnits || 0}</div><div className="text-slate-500 text-sm">Organization Units</div></div>
            </CardContent>
          </Card>
        </div>

        {/* Survey Grid */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-slate-400" /> Recent Analysis Boards
          </h2>

          {surveys && surveys.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {surveys.map((survey) => (
                <Link key={survey.id} href="/analysis" className="group">
                  <Card className="h-full hover:shadow-lg transition-all duration-200 border-slate-200 hover:border-blue-300 cursor-pointer group-hover:-translate-y-1">
                    <CardHeader>
                      <div className="flex justify-between items-start mb-2">
                        <Badge variant="secondary" className="bg-slate-100 text-slate-600 group-hover:bg-blue-50 group-hover:text-blue-600">
                          {new Date(survey.created_at).toLocaleDateString()}
                        </Badge>
                      </div>
                      <CardTitle className="text-lg text-slate-900 group-hover:text-blue-700 transition-colors">
                        {survey.title}
                      </CardTitle>
                      <CardDescription>
                        {survey.respondents?.[0]?.count || 0} Respondents
                      </CardDescription>
                    </CardHeader>
                    <CardFooter className="pt-0">
                      <div className="text-sm font-medium text-blue-600 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        Open Dashboard <ArrowRight className="w-4 h-4" />
                      </div>
                    </CardFooter>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-20 bg-slate-100 rounded-lg border-2 border-dashed border-slate-300">
              <div className="mx-auto w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center mb-4">
                <Upload className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-medium text-slate-900">No surveys found</h3>
              <p className="text-slate-500 mb-6">Import your first CSV to get started.</p>
              <Link href="/import">
                <Button>Start Import</Button>
              </Link>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// Icon helper since Building2 wasn't imported in top block
function Building2({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect width="16" height="20" x="4" y="2" rx="2" ry="2" /><path d="M9 22v-4h6v4" /><path d="M8 6h.01" /><path d="M16 6h.01" /><path d="M8 10h.01" /><path d="M16 10h.01" /><path d="M8 14h.01" /><path d="M16 14h.01" /><path d="M8 18h.01" /><path d="M16 18h.01" /></svg>
  )
}