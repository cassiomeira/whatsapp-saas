import { IXCSoftService } from "./server/ixcService";

async function testarIXC() {
  console.log("🔍 TESTE DA API IXC SOFT COM TOKEN CORRETO\n");
  
  const config = {
    apiUrl: "sis.netcartelecom.com.br",
    apiToken: "10/901bfe8956814be1e3621c552e3fcba62456f4d74cc5c9a5804443e9f79303a0",
  };

  const ixcService = new IXCSoftService(config);

  try {
    const cpf = "08484431606";
    console.log(`Buscando CPF: ${cpf}...`);
    
    const cliente = await ixcService.buscarClientePorDocumento(cpf);
    
    if (cliente) {
      console.log("✅ Cliente encontrado!");
      console.log(`   ID: ${cliente.id}`);
      console.log(`   Nome: ${cliente.razao}`);
      console.log(`   CPF/CNPJ: ${cliente.cnpj_cpf}`);
      
      const faturas = await ixcService.buscarFaturasEmAberto(cliente.id);
      console.log(`\n✅ Faturas: ${faturas.length}`);
    }
  } catch (error: any) {
    console.error("❌ ERRO:", error.message);
  }
}

testarIXC();
