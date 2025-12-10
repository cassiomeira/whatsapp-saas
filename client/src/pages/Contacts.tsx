import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRef, useState, useEffect } from "react";
import { toast } from "sonner";

import WorkspaceGuard from "@/components/WorkspaceGuard";
export default function Contacts() {
  const utils = trpc.useContext();
  const { data: contacts, refetch } = trpc.contacts.list.useQuery();
  const importVcf = trpc.contacts.importVcf.useMutation({
    onSuccess: (res) => {
      toast.success(`Importado: ${res.created} novo(s). Ignorados: ${res.skipped}.`);
      refetch();
    },
    onError: (err) => toast.error(err.message || "Falha ao importar VCF"),
  });
  const deleteContact = trpc.contacts.delete.useMutation({
    onSuccess: () => {
      toast.success("Contato excluído");
      refetch();
    },
    onError: (err) => toast.error(err.message || "Erro ao excluir"),
  });
  const deleteAll = trpc.contacts.deleteAll.useMutation({
    onSuccess: () => {
      toast.success("Todos os contatos foram excluídos");
      refetch();
    },
    onError: (err) => toast.error(err.message || "Erro ao excluir todos"),
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputCsvRef = useRef<HTMLInputElement | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    contactId: number | null;
  }>({ x: 0, y: 0, contactId: null });

  const importCsv = trpc.contacts.importCsv.useMutation({
    onSuccess: (res) => {
      toast.success(`Importado (CSV): ${res.created} novo(s). Ignorados: ${res.skipped}.`);
      refetch();
    },
    onError: (err) => toast.error(err.message || "Falha ao importar CSV"),
  });

  const handleImportCsv = async (file?: File | null, input?: string) => {
    const text = input ?? (file ? await file.text() : "");
    if (!text.trim()) {
      toast.error("Arquivo CSV vazio ou inválido.");
      return;
    }
    setIsImportingCsv(true);
    setImportMessage("Importando contatos (CSV)...");
    try {
      await importCsv.mutateAsync({ csvText: text });
    } catch (error) {
      toast.error("Falha ao importar CSV");
    } finally {
      setIsImportingCsv(false);
      setImportMessage(null);
    }
  };

  const handleExportVcf = () => {
    if (!contacts || contacts.length === 0) {
      toast.info("Não há contatos para exportar.");
      return;
    }
    const escape = (s: string) => s.replace(/,/g, "\\,").replace(/;/g, "\\;");
    const lines = contacts.map((c) => {
      const name = c.name || "";
      const tel = c.whatsappNumber || "";
      return [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `FN:${escape(name)}`,
        `TEL;TYPE=CELL:${tel}`,
        "END:VCARD",
      ].join("\n");
    });
    const vcf = lines.join("\n");
    const blob = new Blob([vcf], { type: "text/vcard;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "contatos.vcf";
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Contatos exportados em VCF.");
  };

  const handleExportCsv = () => {
    if (!contacts || contacts.length === 0) {
      toast.info("Não há contatos para exportar.");
      return;
    }

    const header = ["name", "whatsappNumber", "kanbanStatus", "createdAt"];
    const rows = contacts.map((c) => [
      `"${(c.name || "").replace(/"/g, '""')}"`,
      `"${(c.whatsappNumber || "").replace(/"/g, '""')}"`,
      `"${(c.kanbanStatus || "").replace(/"/g, '""')}"`,
      `"${new Date(c.createdAt).toISOString()}"`,
    ]);

    const csv = [header.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "contatos.csv";
    link.click();

    URL.revokeObjectURL(url);
    toast.success("Contatos exportados em CSV.");
  };

  const updateStatus = trpc.contacts.updateKanbanStatus.useMutation({
    onSuccess: () => {
      toast.success("Contato movido");
      refetch();
    },
    onError: (err) => toast.error(err.message || "Erro ao mover contato"),
  });

  useEffect(() => {
    const handler = () => setContextMenu((c) => ({ ...c, contactId: null }));
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, []);

  const filteredContacts = (contacts || []).filter((c) => {
    const term = search.toLowerCase();
    if (!term) return true;
    return (
      (c.name || "").toLowerCase().includes(term) ||
      (c.whatsappNumber || "").toLowerCase().includes(term)
    );
  });

  const statusOptions = [
    { id: "new_contact", label: "Novo contato" },
    { id: "waiting_attendant", label: "Aguardando atendente" },
    { id: "negotiating", label: "Negociando" },
    { id: "archived", label: "Arquivado" },
  ];

  return (
    <WorkspaceGuard>
      <DashboardLayout>
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-6">Contatos</h1>

        <div className="flex items-center gap-3 mb-4">
          <Input
            placeholder="Buscar por nome ou WhatsApp"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />

          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
          >
            {isImporting ? "Importando..." : "Importar VCF"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".vcf,text/vcard"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setIsImporting(true);
              setImportMessage("Importando contatos... isso pode levar alguns minutos para grandes arquivos.");
              try {
                const text = await file.text();
                importVcf.mutate({ vcfText: text });
              } catch (error) {
                toast.error("Não foi possível ler o arquivo VCF");
              } finally {
                setIsImporting(false);
                setImportMessage(null);
                e.target.value = "";
              }
            }}
          />

          <Button
            variant="outline"
            onClick={() => fileInputCsvRef.current?.click()}
            disabled={isImportingCsv}
          >
            {isImportingCsv ? "Importando CSV..." : "Importar CSV"}
          </Button>
          <input
            ref={fileInputCsvRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              await handleImportCsv(file);
              e.target.value = "";
            }}
          />

          <Button
            variant="secondary"
            onClick={handleExportCsv}
          >
            Exportar CSV
          </Button>

          <Button
            variant="secondary"
            onClick={handleExportVcf}
          >
            Exportar VCF
          </Button>

          <Button
            variant="destructive"
            onClick={() => {
              if (confirm("Tem certeza que deseja excluir TODOS os contatos?")) {
                deleteAll.mutate();
              }
            }}
          >
            Excluir todos
          </Button>
        </div>

        {importMessage ? (
          <div className="mb-4 text-sm text-muted-foreground">
            {importMessage}
          </div>
        ) : null}
        
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredContacts && filteredContacts.length > 0 ? (
                filteredContacts.map((contact) => (
                  <TableRow
                    key={contact.id}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({ x: e.clientX, y: e.clientY, contactId: contact.id });
                    }}
                  >
                    <TableCell>{contact.name || "Sem nome"}</TableCell>
                    <TableCell>{contact.whatsappNumber}</TableCell>
                    <TableCell>{contact.kanbanStatus}</TableCell>
                    <TableCell>{new Date(contact.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (confirm(`Excluir o contato ${contact.name || contact.whatsappNumber}?`)) {
                            deleteContact.mutate({ contactId: contact.id });
                          }
                        }}
                      >
                        Excluir
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Nenhum contato cadastrado
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>

        {contextMenu.contactId && (
          <div
            className="fixed bg-popover border border-border rounded shadow-lg z-50 text-sm"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            <div className="px-3 py-2 border-b border-border font-semibold">Mover contato</div>
            {statusOptions.map((st) => (
              <button
                key={st.id}
                className="w-full text-left px-3 py-2 hover:bg-accent"
                onClick={() => {
                  if (contextMenu.contactId) {
                    updateStatus.mutate({ contactId: contextMenu.contactId, status: st.id });
                  }
                  setContextMenu({ ...contextMenu, contactId: null });
                }}
              >
                {st.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
    </WorkspaceGuard>
  );
}