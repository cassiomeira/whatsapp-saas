import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Megaphone } from "lucide-react";

import WorkspaceGuard from "@/components/WorkspaceGuard";
export default function Campaigns() {
  return (
    <WorkspaceGuard>
      <DashboardLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Campanhas</h1>
            <p className="text-muted-foreground">Disparos em massa</p>
          </div>
          <Button>
            <Megaphone className="w-4 h-4 mr-2" />
            Nova Campanha
          </Button>
        </div>
        
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            Nenhuma campanha criada. Clique em "Nova Campanha" para começar.
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
    </WorkspaceGuard>
  );
}