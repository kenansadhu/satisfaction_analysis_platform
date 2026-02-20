import { Card, CardContent } from "@/components/ui/card";
import { ArrowUpRight, ArrowDownRight, Minus, TrendingUp } from "lucide-react";

interface MetricCardProps {
    title: string;
    value: React.ReactNode;
    description: string;
    trend?: "up" | "down" | "flat";
    trendValue?: string;
    icon: any;
    colorClass: string;
}

export function MetricCard({ title, value, description, trend, trendValue, icon: Icon, colorClass }: MetricCardProps) {
    return (
        <Card className="border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
            <div className={`absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity ${colorClass}`}>
                <Icon className="w-16 h-16" />
            </div>
            <CardContent className="p-6">
                <div className="flex justify-between items-start mb-4">
                    <div className={`p-2 rounded-lg ${colorClass} bg-opacity-10`}>
                        <Icon className={`w-5 h-5 ${colorClass.replace("text-", "text-").replace("bg-", "")}`} />
                    </div>
                </div>
                <div className="space-y-1">
                    <h3 className="text-sm font-medium text-slate-500">{title}</h3>
                    <div className="text-3xl font-bold text-slate-900">{value}</div>
                    <div className="flex items-center gap-2 text-xs">
                        {trend && (
                            <span className={`flex items-center gap-0.5 font-medium ${trend === "up" ? "text-green-600" : trend === "down" ? "text-red-600" : "text-slate-600"
                                }`}>
                                {trend === "up" ? <TrendingUp className="w-3 h-3" /> : trend === "down" ? <ArrowDownRight className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                                {trendValue}
                            </span>
                        )}
                        <span className="text-slate-400">{description}</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
