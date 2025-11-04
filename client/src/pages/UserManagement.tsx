import DashboardLayout from "@/components/DashboardLayout";
import WorkspaceGuard from "@/components/WorkspaceGuard";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Check, X, Clock, Ban } from "lucide-react";
import { toast } from "sonner";

export default function UserManagement() {
  const { data: users, refetch } = trpc.admin.listUsers.useQuery();
  const approveUser = trpc.admin.approveUser.useMutation();
  const blockUser = trpc.admin.blockUser.useMutation();

  const handleApprove = async (userId: number) => {
    try {
      await approveUser.mutateAsync({ userId });
      toast.success("Usuário aprovado com sucesso!");
      refetch();
    } catch (error) {
      toast.error("Erro ao aprovar usuário");
    }
  };

  const handleBlock = async (userId: number) => {
    try {
      await blockUser.mutateAsync({ userId });
      toast.success("Usuário bloqueado!");
      refetch();
    } catch (error) {
      toast.error("Erro ao bloquear usuário");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-500"><Check className="w-3 h-3 mr-1" /> Aprovado</Badge>;
      case "pending":
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" /> Pendente</Badge>;
      case "blocked":
        return <Badge variant="destructive"><Ban className="w-3 h-3 mr-1" /> Bloqueado</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const pendingCount = users?.filter(u => u.status === "pending").length || 0;

  return (
    <WorkspaceGuard>
      <DashboardLayout>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Gerenciamento de Usuários</h1>
              <p className="text-muted-foreground">
                Aprove ou bloqueie usuários do sistema
              </p>
            </div>
            {pendingCount > 0 && (
              <Badge variant="secondary" className="text-lg px-4 py-2">
                {pendingCount} {pendingCount === 1 ? "usuário pendente" : "usuários pendentes"}
              </Badge>
            )}
          </div>

          <div className="bg-card rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Função</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Cadastrado em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!users || users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      Nenhum usuário encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.name || "Sem nome"}</TableCell>
                      <TableCell>{user.email || "Sem email"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {user.workspaceRole === "owner" ? "Proprietário" : 
                           user.workspaceRole === "admin" ? "Administrador" : "Agente"}
                        </Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(user.status)}</TableCell>
                      <TableCell>
                        {new Date(user.createdAt).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          {user.status === "pending" && (
                            <>
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => handleApprove(user.id)}
                              >
                                <Check className="w-4 h-4 mr-1" />
                                Aprovar
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleBlock(user.id)}
                              >
                                <X className="w-4 h-4 mr-1" />
                                Bloquear
                              </Button>
                            </>
                          )}
                          {user.status === "approved" && user.workspaceRole !== "owner" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleBlock(user.id)}
                            >
                              <Ban className="w-4 h-4 mr-1" />
                              Bloquear
                            </Button>
                          )}
                          {user.status === "blocked" && (
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => handleApprove(user.id)}
                            >
                              <Check className="w-4 h-4 mr-1" />
                              Aprovar
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </DashboardLayout>
    </WorkspaceGuard>
  );
}

