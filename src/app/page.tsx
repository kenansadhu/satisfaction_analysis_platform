import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, BarChart3, Settings, Upload, ArrowRight, Database, Users, Building2, Sparkles, TrendingUp, Zap, PieChart, LayoutDashboard } from "lucide-react";

export const revalidate = 0;

export default async function HomePage() {
  const { data: surveys } = await supabase
    .from('surveys')
    .select('*, respondents(count)')
    .order('created_at', { ascending: false });

  const { count: totalUnits } = await supabase.from('organization_units').select('*', { count: 'exact', head: true });
  const { count: totalSegments } = await supabase.from('feedback_segments').select('*', { count: 'exact', head: true });

  const totalRespondents = surveys?.reduce((acc, s) => acc + (s.respondents?.[0]?.count || 0), 0) || 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans transition-colors duration-300">

      {/* --- HERO SECTION --- */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950">
        {/* Animated Grid Background */}
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: '60px 60px'
        }} />
        {/* Gradient Orbs */}
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-indigo-500/15 rounded-full blur-3xl" />

        <div className="relative max-w-6xl mx-auto px-8 py-16">
          <div className="flex justify-between items-center">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-400/20 rounded-full px-4 py-1.5 text-sm text-blue-300">
                <Sparkles className="w-3.5 h-3.5" />
                AI-Powered Analytics Platform
              </div>
              <h1 className="text-4xl font-bold text-white tracking-tight">
                UPH Survey Platform<br />
                <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                  AI Analytics and Insights
                </span>
              </h1>
              <p className="text-slate-400 text-lg max-w-md">
                For LP2MU UPH
              </p>
            </div>
            <div className="flex gap-3">
              <Link href="/units">
                <Button variant="outline" className="gap-2 bg-white/5 border-white/20 text-white hover:bg-white/10 hover:text-white">
                  <Settings className="w-4 h-4" /> Manage Units
                </Button>
              </Link>
              <Link href="/import">
                <Button className="gap-2 bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-600/25 border border-blue-500/50">
                  <Upload className="w-4 h-4" /> Import New Survey
                </Button>
              </Link>
            </div>
          </div>

          {/* Floating Stats */}
          <div className="grid grid-cols-4 gap-4 mt-12">
            {[
              { label: "Active Surveys", value: surveys?.length || 0, icon: Database, color: "from-blue-500 to-blue-600" },
              { label: "Respondents", value: totalRespondents.toLocaleString(), icon: Users, color: "from-violet-500 to-purple-600" },
              { label: "Units Tracked", value: totalUnits || 0, icon: Building2, color: "from-indigo-500 to-blue-600" },
              { label: "AI Segments", value: (totalSegments || 0).toLocaleString(), icon: Zap, color: "from-cyan-500 to-blue-500" },
            ].map((stat, i) => (
              <div key={i} className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl blur-xl -z-10"
                  style={{ background: `linear-gradient(135deg, rgba(59,130,246,0.2), rgba(99,102,241,0.2))` }} />
                <div className="bg-white/5 backdrop-blur-sm border border-white/10 dark:border-white/5 rounded-xl p-5 hover:bg-white/10 transition-all duration-300">
                  <stat.icon className="w-5 h-5 text-blue-400 mb-2" />
                  <div className="text-2xl font-bold text-white">{stat.value}</div>
                  <div className="text-sm text-slate-400">{stat.label}</div>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* --- MAIN CONTENT --- */}
      <div className="max-w-6xl mx-auto px-8 py-12 space-y-10">

        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-4">
          <Link href="/executive" className="group">
            <div className="flex items-center gap-4 p-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md transition-all duration-200 group-hover:-translate-y-0.5">
              <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-xl group-hover:bg-blue-100 dark:group-hover:bg-blue-900/40 transition-colors">
                <LayoutDashboard className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <div className="font-semibold text-slate-900 dark:text-slate-100">Executive View</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">See a global view of the SSI result of all units</div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-300 dark:text-slate-600 ml-auto group-hover:text-blue-500 transition-all" />
            </div>
          </Link>
          <Link href="/surveys" className="group">
            <div className="flex items-center gap-4 p-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-purple-300 dark:hover:border-purple-700 hover:shadow-md transition-all duration-200 group-hover:-translate-y-0.5">
              <div className="p-3 bg-purple-50 dark:bg-purple-950/40 rounded-xl group-hover:bg-purple-100 dark:group-hover:bg-purple-900/40 transition-colors">
                <PieChart className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <div className="font-semibold text-slate-900 dark:text-slate-100">Survey Dashboard</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">Review all imported surveys</div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-300 dark:text-slate-600 ml-auto group-hover:text-purple-500 transition-all" />
            </div>
          </Link>
          <Link href="/units" className="group">
            <div className="flex items-center gap-4 p-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-md transition-all duration-200 group-hover:-translate-y-0.5">
              <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/40 transition-colors">
                <Building2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <div className="font-semibold text-slate-900 dark:text-slate-100">Organization Units</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">Manage faculties & departments</div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-300 dark:text-slate-600 ml-auto group-hover:text-indigo-500 transition-all" />
            </div>
          </Link>
        </div>

        {/* Survey Grid */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-slate-400 dark:text-slate-400" /> Recent Survey Projects
          </h2>

          {surveys && surveys.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {surveys.map((survey) => (
                <Link key={survey.id} href={`/surveys/${survey.id}`} className="group">
                  <Card className="h-full bg-white dark:bg-slate-900 hover:shadow-lg transition-all duration-200 border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700 cursor-pointer group-hover:-translate-y-1 overflow-hidden">
                    {/* Colored top stripe */}
                    <div className="h-1 bg-gradient-to-r from-blue-500 to-indigo-500" />
                    <CardHeader>
                      <div className="flex justify-between items-start mb-2">
                        <Badge variant="secondary" className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/30 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          {new Date(survey.created_at).toLocaleDateString()}
                        </Badge>
                      </div>
                      <CardTitle className="text-lg text-slate-900 dark:text-slate-100 group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors">
                        {survey.title}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-1.5 dark:text-slate-300">
                        <Users className="w-3.5 h-3.5" />
                        {survey.respondents?.[0]?.count || 0} Respondents
                      </CardDescription>
                    </CardHeader>
                    <CardFooter className="pt-0">
                      <div className="text-sm font-medium text-blue-600 dark:text-blue-400 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        Open Dashboard <ArrowRight className="w-4 h-4" />
                      </div>
                    </CardFooter>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-800">
              <div className="mx-auto w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                <Upload className="w-8 h-8 text-slate-400 dark:text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">No surveys yet</h3>
              <p className="text-slate-500 dark:text-slate-300 mb-6 max-w-md mx-auto">
                Import your first CSV file to begin analyzing student feedback with AI.
              </p>
              <Link href="/import">
                <Button className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 shadow-sm gap-2">
                  <Upload className="w-4 h-4" /> Start Your First Import
                </Button>
              </Link>
            </div>
          )}
        </div>

      </div>

      {/* Footer */}

    </div>
  );
}