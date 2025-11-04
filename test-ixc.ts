import { IXCSoftService } from "./server/ixcService";

async function testarIXC() {
  console.log("🔍 TESTE DA API IXC SOFT\n");
  console.log("=" .repeat(50));

  // Configuração
  const config = {
    apiUrl: "sis.netcartelecom.com.br",
    apiToken: "72e20a330f2b146983dfb2f66a8f05186649b74db9f43aebf86068c13c6156c3",
  };

  const ixcService = new IXCSoftService(config);

  // Teste 1: Buscar cliente por CPF
  console.log("\n📋 TESTE 1: Buscar cliente por CPF");
  console.log("-".repeat(50));
  
  try {
    const cpf = "08484431606";
    console.log(`Buscando CPF: ${cpf}...`);
    
    const cliente = await ixcService.buscarClientePorDocumento(cpf);
    
    if (cliente) {
      console.log("✅ Cliente encontrado!");
      console.log(`   ID: ${cliente.id}`);
      console.log(`   Nome: ${cliente.razao}`);
      console.log(`   CPF/CNPJ: ${cliente.cnpj_cpf}`);
      console.log(`   Telefone: ${cliente.telefone_celular || "N/A"}`);
      console.log(`   Email: ${cliente.email || "N/A"}`);
      
      // Teste 2: Buscar faturas em aberto
      console.log("\n📋 TESTE 2: Buscar faturas em aberto");
      console.log("-".repeat(50));
      
      const faturas = await ixcService.buscarFaturasEmAberto(cliente.id);
      
      if (faturas.length === 0) {
        console.log("✅ Nenhuma fatura em aberto!");
      } else {
        console.log(`✅ Encontradas ${faturas.length} fatura(s) em aberto:\n`);
        
        faturas.forEach((fatura, index) => {
          const valor = ixcService.formatarValor(fatura.valor);
          const vencimento = ixcService.formatarData(fatura.data_vencimento);
          const vencida = new Date(fatura.data_vencimento) < new Date();
          
          console.log(`   ${index + 1}. ${vencida ? "⚠️ VENCIDA" : "📅 A vencer"}`);
          console.log(`      Valor: ${valor}`);
          console.log(`      Vencimento: ${vencimento}`);
          console.log(`      Documento: ${fatura.documento || "N/A"}`);
          console.log(`      Status: ${fatura.status_cobranca}`);
          console.log("");
        });
      }
      
      // Teste 3: Simular desbloqueio (comentado para não executar de verdade)
      console.log("\n📋 TESTE 3: Desbloqueio de confiança");
      console.log("-".repeat(50));
      console.log("⚠️ Teste de desbloqueio desabilitado (descomente para testar)");
      
      // Descomente as linhas abaixo para testar desbloqueio real
      /*
      const resultado = await ixcService.executarDesbloqueioConfianca(cliente.id);
      if (resultado.success) {
        console.log(`✅ ${resultado.message}`);
      } else {
        console.log(`❌ ${resultado.message}`);
      }
      */
      
    } else {
      console.log("❌ Cliente não encontrado!");
    }
    
  } catch (error: any) {
    console.error("❌ ERRO:", error.message);
    if (error.response?.data) {
      console.error("Detalhes:", JSON.stringify(error.response.data, null, 2));
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("✅ TESTE CONCLUÍDO!\n");
}

// Executar teste
testarIXC().catch(console.error);

