import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import WorkspaceGuard from "@/components/WorkspaceGuard";
export default function Contacts() {
  const { data: contacts } = trpc.contacts.list.useQuery();

  return (
    <WorkspaceGuard>
      <DashboardLayout>
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-6">Contatos</h1>
        
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts && contacts.length > 0 ? (
                contacts.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell>{contact.name || "Sem nome"}</TableCell>
                    <TableCell>{contact.whatsappNumber}</TableCell>
                    <TableCell>{contact.kanbanStatus}</TableCell>
                    <TableCell>{new Date(contact.createdAt).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Nenhum contato cadastrado
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </DashboardLayout>
    </WorkspaceGuard>
  );
}