import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Workflow } from "lucide-react";

import WorkspaceGuard from "@/components/WorkspaceGuard";
export default function Flows() {
  return (
    <WorkspaceGuard>
      <DashboardLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Fluxos de Conversa</h1>
            <p className="text-muted-foreground">Crie automações inteligentes</p>
          </div>
          <Button>
            <Workflow className="w-4 h-4 mr-2" />
            Novo Fluxo
          </Button>
        </div>
        
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            Nenhum fluxo criado ainda. Clique em "Novo Fluxo" para começar.
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
    </WorkspaceGuard>
  );
}