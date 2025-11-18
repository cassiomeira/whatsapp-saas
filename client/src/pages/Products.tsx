import { useState, useRef } from "react";

import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { toast } from "sonner";
import {
  Upload,
  Search,
  Loader2,
  CheckCircle,
  AlertCircle,
  Trash2,
} from "lucide-react";

export default function Products() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [isResettingCatalog, setIsResettingCatalog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    data: products,
    isLoading: isLoadingProducts,
    refetch: refetchProducts,
  } = trpc.products.list.useQuery();
  const { data: uploads, refetch: refetchUploads } =
    trpc.products.getUploads.useQuery();
  const { data: searchResults, isLoading: isSearching } =
    trpc.products.search.useQuery(
      { query: searchQuery },
      { enabled: searchQuery.length > 0 }
    );

  const uploadCsvMutation = trpc.products.uploadCsv.useMutation();
  const deleteUploadMutation = trpc.products.deleteUpload.useMutation();
  const resetCatalogMutation = trpc.products.resetCatalog.useMutation();

  const displayProducts = searchQuery.length > 0 ? searchResults : products;

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".csv")) {
      toast.error("Por favor, selecione um arquivo CSV");
      return;
    }

    setIsUploading(true);
    try {
      const csvData = await file.text();

      const lines = csvData.split("\n");
      if (lines.length < 2) {
        toast.error("CSV deve ter pelo menos um cabeçalho e uma linha de dados");
        setIsUploading(false);
        return;
      }

      const header = lines[0].toLowerCase();
      if (!header.includes("sku") || !header.includes("name")) {
        toast.error(
          "CSV deve ter colunas: sku, name, price, quantity, description"
        );
        setIsUploading(false);
        return;
      }

      const result = await uploadCsvMutation.mutateAsync({
        fileContent: csvData,
        fileName: file.name,
        fileSize: file.size,
      });

      if (result?.warnings?.length) {
        toast.warning(
          `Upload concluído com avisos: ${result.warnings.join(" | ")}`
        );
      } else {
        toast.success("Upload iniciado! Processando produtos...");
      }

      refetchUploads();

      setTimeout(() => {
        refetchProducts();
      }, 2000);
    } catch (error) {
      console.error("Erro ao fazer upload:", error);
      const message =
        error instanceof Error ? error.message : "Erro ao fazer upload do CSV";
      toast.error(message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDeleteUpload = async (uploadId: number) => {
    if (!confirm("Tem certeza que deseja deletar este upload?")) {
      return;
    }

    setDeletingId(uploadId);
    try {
      await deleteUploadMutation.mutateAsync({ uploadId });
      toast.success("Upload deletado com sucesso");
      refetchUploads();
    } catch (error) {
      console.error("Erro ao deletar upload:", error);
      toast.error("Erro ao deletar upload");
    } finally {
      setDeletingId(null);
    }
  };

  const handleResetCatalog = async () => {
    if (
      !confirm(
        "Esta ação vai remover todos os produtos e histórico de uploads. Deseja continuar?"
      )
    ) {
      return;
    }

    setIsResettingCatalog(true);
    try {
      await resetCatalogMutation.mutateAsync();
      toast.success("Catálogo de produtos zerado com sucesso.");
      await Promise.all([refetchProducts(), refetchUploads()]);
    } catch (error) {
      console.error("Erro ao zerar catálogo:", error);
      const message =
        error instanceof Error
          ? error.message
          : "Erro ao zerar o catálogo de produtos.";
      toast.error(message);
    } finally {
      setIsResettingCatalog(false);
    }
  };

  const formatPrice = (priceInCents: number) => {
    return (priceInCents / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-100 text-green-800">Concluído</Badge>;
      case "processing":
        return <Badge className="bg-blue-100 text-blue-800">Processando</Badge>;
      case "failed":
        return <Badge className="bg-red-100 text-red-800">Erro</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Catálogo de Produtos</h1>
            <p className="text-gray-600 mt-1">
              Gerencie seu catálogo de produtos para consultas do bot IA
            </p>
          </div>
          <Button
            variant="destructive"
            onClick={handleResetCatalog}
            disabled={isResettingCatalog}
            className="w-full md:w-auto"
          >
            {isResettingCatalog ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4 mr-2" />
            )}
            Zerar catálogo
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Importar Produtos via CSV
            </CardTitle>
            <CardDescription>
              Faça upload de um arquivo CSV com até milhares de produtos. Você pode
              fazer múltiplos uploads e a IA consultará todos os produtos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                <p className="text-sm font-medium">
                  Clique para selecionar um arquivo CSV
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  ou arraste um arquivo aqui
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded p-4">
                <p className="text-sm font-medium text-blue-900 mb-2">
                  Formato esperado do CSV:
                </p>
                <code className="text-xs bg-white p-2 rounded block text-gray-700">
                  sku,name,price,quantity,description
                  <br />
                  PROD001,Produto 1,19.90,100,Descrição do produto
                  <br />
                  PROD002,Produto 2,29.90,50,Outro produto
                </code>
              </div>

              {isUploading && (
                <div className="flex items-center gap-2 text-blue-600">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Enviando arquivo...</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {uploads && uploads.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Histórico de Uploads</CardTitle>
              <CardDescription>
                Seus uploads de CSV - você pode deletar uploads antigos para limpar
                o histórico
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Arquivo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Produtos</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {uploads.map((upload) => (
                    <TableRow key={upload.id}>
                      <TableCell className="font-medium">
                        {upload.fileName}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {upload.status === "completed" && (
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          )}
                          {upload.status === "failed" && (
                            <AlertCircle className="w-4 h-4 text-red-600" />
                          )}
                          {getStatusBadge(upload.status)}
                        </div>
                      </TableCell>
                      <TableCell>{upload.rowCount || 0}</TableCell>
                      <TableCell className="text-sm text-gray-500">
                        {new Date(upload.createdAt).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteUpload(upload.id)}
                          disabled={deletingId === upload.id}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          {deletingId === upload.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {uploads.map(
                (upload) =>
                  upload.errorMessage && (
                    <div key={upload.id} className="mt-2 text-sm text-red-600">
                      <strong>Erro ({upload.fileName}):</strong> {upload.errorMessage}
                    </div>
                  )
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Produtos Cadastrados</CardTitle>
            <CardDescription>
              Total: {products?.length || 0} produtos (de todos os uploads)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Buscar por nome ou SKU..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              {isLoadingProducts || isSearching ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : displayProducts && displayProducts.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Preço</TableHead>
                      <TableHead>Quantidade</TableHead>
                      <TableHead>Descrição</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayProducts.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell className="font-mono text-sm">
                          {product.sku}
                        </TableCell>
                        <TableCell className="font-medium">
                          {product.name}
                        </TableCell>
                        <TableCell>{formatPrice(product.price)}</TableCell>
                        <TableCell>
                          <Badge
                            variant={(product.quantity ?? 0) > 0 ? "default" : "secondary"}
                          >
                            {(product.quantity ?? 0)} un
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-gray-600 max-w-xs truncate">
                          {product.description || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>Nenhum produto encontrado</p>
                  <p className="text-sm">Faça upload de um arquivo CSV para começar</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}


