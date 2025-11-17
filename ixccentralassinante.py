"""
Script de Automação Web - Central do Assinante IXC Soft
Objetivo: Fazer login, buscar faturas em aberto e realizar desbloqueio de confiança
Tecnologia: Selenium WebDriver (controla um navegador real)
Entrada: CPF e Senha solicitados via terminal
"""

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.action_chains import ActionChains
import time
import os
import sys
import getpass
from datetime import datetime

class CentralAssinanteAutomacao:
    def __init__(self, cpf, senha, headless=False):
        """
        Inicializa a automação com CPF e senha do cliente.
        
        Args:
            cpf (str): CPF do cliente (somente números)
            senha (str): Senha do cliente
            headless (bool): Se True, executa sem interface gráfica
        """
        self.cpf = cpf
        self.senha = senha
        self.base_url = "https://sis.netcartelecom.com.br/central_assinante_web"
        self.login_url = f"{self.base_url}/login"
        self.screenshots_dir = "/tmp/ixc_screenshots"
        
        # Criar diretório para screenshots
        if not os.path.exists(self.screenshots_dir):
            os.makedirs(self.screenshots_dir)
        
        # Configurar opções do Chrome
        chrome_options = Options()
        if headless:
            chrome_options.add_argument("--headless")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--disable-blink-features=AutomationControlled")
        chrome_options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        chrome_options.add_argument("--ignore-certificate-errors")
        
        # Inicializar o driver
        try:
            self.driver = webdriver.Chrome(options=chrome_options)
        except Exception as e:
            print(f"Erro ao inicializar Chrome: {e}")
            # Tenta novamente, caso o erro seja temporário
            self.driver = webdriver.Chrome(options=chrome_options)
        
        self.wait = WebDriverWait(self.driver, 15)
        self.actions = ActionChains(self.driver)
        
    def tirar_screenshot(self, nome):
        """
        Tira um screenshot da página para debug.
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        caminho = os.path.join(self.screenshots_dir, f"{nome}_{timestamp}.png")
        self.driver.save_screenshot(caminho)
        print(f"   → Screenshot salvo: {caminho}")
        
    def fazer_login(self):
        """
        Realiza o login na Central do Assinante.
        """
        print(f"\n{'='*70}")
        print("ETAPA 1: LOGIN NA CENTRAL DO ASSINANTE")
        print(f"{'='*70}")
        print(f"Acessando: {self.login_url}")
        
        try:
            self.driver.get(self.login_url)
            self.driver.maximize_window() # Adicionado para garantir que o botão não fique oculto
            time.sleep(3)
            
            self.tirar_screenshot("01_login_page")
            
            print(f"\nPreenchendo CPF: {self.cpf}")
            
            campo_login = None
            seletores_login = [
                (By.CSS_SELECTOR, "input[type='text']"),
                (By.NAME, "login"),
                (By.ID, "login"),
                (By.XPATH, "//input[@placeholder='Login' or @placeholder='CPF']"),
            ]
            
            for seletor in seletores_login:
                try:
                    campo_login = self.wait.until(EC.presence_of_element_located(seletor))
                    print(f"   ✓ Campo de login encontrado")
                    break
                except:
                    continue
            
            if not campo_login:
                print("   ✗ Erro: Campo de login não encontrado!")
                self.tirar_screenshot("01_erro_login_nao_encontrado")
                return False
            
            campo_login.clear()
            campo_login.send_keys(self.cpf)
            time.sleep(1)
            
            print("Preenchendo senha...")
            
            campo_senha = None
            seletores_senha = [
                (By.CSS_SELECTOR, "input[type='password']"),
                (By.NAME, "senha"),
                (By.ID, "senha"),
                (By.XPATH, "//input[@placeholder='Senha']"),
            ]
            
            for seletor in seletores_senha:
                try:
                    campo_senha = self.driver.find_element(*seletor)
                    print(f"   ✓ Campo de senha encontrado")
                    break
                except:
                    continue
            
            if not campo_senha:
                print("   ✗ Erro: Campo de senha não encontrado!")
                self.tirar_screenshot("01_erro_senha_nao_encontrado")
                return False
            
            campo_senha.clear()
            campo_senha.send_keys(self.senha)
            time.sleep(1)
            
            print("Clicando no botão 'ENTRAR'...")
            
            botao_entrar = None
            seletores_botao = [
                (By.XPATH, "//button[contains(text(), 'ENTRAR') or contains(text(), 'Entrar')]"),
                (By.CSS_SELECTOR, "button[type='submit']"),
                (By.XPATH, "//*[contains(text(), 'ENTRAR') or contains(text(), 'Entrar')]"),
            ]
            
            for seletor in seletores_botao:
                try:
                    botao_entrar = self.wait.until(EC.element_to_be_clickable(seletor))
                    print(f"   ✓ Botão 'ENTRAR' encontrado")
                    break
                except:
                    continue
            
            if not botao_entrar:
                print("   ✗ Erro: Botão 'ENTRAR' não encontrado!")
                self.tirar_screenshot("01_erro_botao_nao_encontrado")
                return False
            
            self.driver.execute_script("arguments[0].click();", botao_entrar)
            time.sleep(4)
            
            self.tirar_screenshot("02_apos_login")
            
            url_atual = self.driver.current_url.lower()
            if "login" not in url_atual:
                print("\n   ✓ Login realizado com SUCESSO!")
                print(f"   → URL atual: {self.driver.current_url}")
                return True
            else:
                print("\n   ✗ Erro: Login falhou. Verifique CPF e senha.")
                print(f"   → URL atual: {self.driver.current_url}")
                return False
                
        except Exception as e:
            print(f"   ✗ Erro ao fazer login: {e}")
            self.tirar_screenshot("01_erro_excecao")
            return False
    
    def buscar_faturas_em_aberto(self):
        """
        Busca as faturas em aberto na Central do Assinante.
        """
        print(f"\n{'='*70}")
        print("ETAPA 2: BUSCAR FATURAS EM ABERTO")
        print(f"{'='*70}")
        
        try:
            time.sleep(2)
            
            self.tirar_screenshot("03_pagina_principal")
            
            print("Procurando por seção de faturas...")
            
            # Estratégia 1: Procurar por elementos de fatura e fazer scroll + clique
            elementos_fatura = self.driver.find_elements(By.XPATH, "//*[contains(text(), 'Consultar fatura') or contains(text(), 'consultar fatura')]")
            
            if elementos_fatura:
                print(f"   ✓ {len(elementos_fatura)} elemento(s) de fatura encontrado(s).")
                print("   → Tentando clicar no primeiro elemento de fatura...")
                
                try:
                    elemento = elementos_fatura[0]
                    self.driver.execute_script("arguments[0].scrollIntoView(true);", elemento)
                    time.sleep(1)
                    self.driver.execute_script("arguments[0].click();", elemento)
                    time.sleep(2)
                    self.tirar_screenshot("04_apos_clicar_fatura")
                    print("   ✓ Clique realizado com sucesso!")
                except Exception as e:
                    print(f"   → Clique falhou ({e}), continuando com busca direta...")
            
            # Estratégia 2: Procurar diretamente por informações de faturas na página
            print("Procurando por informações de faturas na página...")
            
            faturas = []
            
            # Procurar por tabelas
            tabelas = self.driver.find_elements(By.TAG_NAME, "table")
            
            if tabelas:
                print(f"   ✓ {len(tabelas)} tabela(s) encontrada(s).")
                for tabela in tabelas:
                    linhas = tabela.find_elements(By.TAG_NAME, "tr")
                    for linha in linhas:
                        texto_linha = linha.text.strip()
                        if texto_linha and ("R$" in texto_linha or "vencimento" in texto_linha.lower() or "data" in texto_linha.lower()):
                            if texto_linha not in faturas:
                                faturas.append(texto_linha)
            
            # Procurar por divs ou spans com valores em R$
            if not faturas:
                elementos_valores = self.driver.find_elements(By.XPATH, "//*[contains(text(), 'R$')]")
                print(f"   ✓ {len(elementos_valores)} elemento(s) com valores encontrado(s).")
                
                for elemento in elementos_valores:
                    try:
                        pai = elemento.find_element(By.XPATH, "..")
                        texto_pai = pai.text.strip()
                        if texto_pai and len(texto_pai) < 500 and texto_pai not in faturas:
                            faturas.append(texto_pai)
                    except:
                        texto = elemento.text.strip()
                        if texto and len(texto) < 200 and texto not in faturas:
                            faturas.append(texto)
            
            # Procurar por qualquer elemento que contenha datas e valores
            if not faturas:
                print("   → Procurando por padrões de fatura na página...")
                todos_elementos = self.driver.find_elements(By.XPATH, "//*")
                
                for elemento in todos_elementos:
                    try:
                        texto = elemento.text.strip()
                        if (("/" in texto and len(texto) < 300) and 
                            ("R$" in texto or "vencimento" in texto.lower() or "fatura" in texto.lower())):
                            if texto not in faturas and len(texto) > 10:
                                faturas.append(texto)
                    except:
                        pass
            
            faturas = list(dict.fromkeys(faturas))
            
            if faturas:
                print(f"\n   ✓ {len(faturas)} fatura(s) encontrada(s)!")
                return faturas
            else:
                print("   ✗ Nenhuma fatura encontrada.")
                return []
                
        except Exception as e:
            print(f"   ✗ Erro ao buscar faturas: {e}")
            self.tirar_screenshot("03_erro_buscar_faturas")
            return []
    
    def realizar_desbloqueio_confianca(self):
        """
        Realiza o desbloqueio de confiança (se disponível na página).
        """
        print(f"\n{'='*70}")
        print("ETAPA 3: DESBLOQUEIO DE CONFIANÇA")
        print(f"{'='*70}")
        
        try:
            print("Procurando opção de Desbloqueio de Confiança...")
            
            # ESTRATÉGIA 1: Procurar pelo seletor CSS fornecido pelo usuário
            seletor_usuario = "#home_central > div.content > div > div > div > div:nth-child(3) > div > div.card-content > table > tbody > tr > td.col-md-2.float-center > a:nth-child(1) > i"
            
            try:
                print("   → Tentando encontrar o botão de desbloqueio pelo seletor CSS do usuário...")
                elemento_desbloqueio = self.wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, seletor_usuario)))
                print(f"   ✓ Elemento de Desbloqueio de Confiança encontrado pelo seletor do usuário!")
                
                # Clicar no elemento (que é um <i> dentro de um <a>)
                self.driver.execute_script("arguments[0].scrollIntoView(true);", elemento_desbloqueio)
                time.sleep(1)
                self.driver.execute_script("arguments[0].click();", elemento_desbloqueio)
                time.sleep(3) # Esperar o modal de confirmação carregar
                self.tirar_screenshot("05_apos_clicar_desbloqueio_usuario")
                
                # Procurar por botão de confirmação no pop-up (mantendo a lógica genérica)
                print("   → Aguardando pop-up de confirmação...")
                
                botoes_confirmar = self.driver.find_elements(By.XPATH, 
                    "//button[contains(text(), 'Confirmar') or contains(text(), 'confirmar') or contains(text(), 'Sim') or contains(text(), 'OK') or contains(text(), 'Desbloquear') or contains(text(), 'desbloquear')] | //a[contains(text(), 'Confirmar') or contains(text(), 'Sim')]"
                )
                
                if botoes_confirmar:
                    print(f"   ✓ Botão de confirmação encontrado!")
                    print("   → Clicando no botão de confirmação...")
                    botao_conf = botoes_confirmar[0]
                    self.driver.execute_script("arguments[0].scrollIntoView(true);", botao_conf)
                    time.sleep(1)
                    self.driver.execute_script("arguments[0].click();", botao_conf)
                    time.sleep(2)
                    self.tirar_screenshot("06_apos_confirmar_desbloqueio")
                    print("\n   ✓ Desbloqueio de Confiança realizado com SUCESSO!")
                    return True
                else:
                    print("   ✗ Botão de confirmação não encontrado. O desbloqueio pode ter sido direto.")
                    # Se não encontrou botão de confirmação, assumimos sucesso se o clique inicial foi bem-sucedido.
                    return True
                    
            except Exception as e:
                print(f"   ✗ Elemento de Desbloqueio de Confiança não encontrado pela Estratégia 1 (Seletor CSS): {e}.")
                # Se a Estratégia 1 falhar, tentamos a Estratégia 2 (baseada em texto de bloqueio)
                pass
            
            # ESTRATÉGIA 2: Procurar pela mensagem "O contrato está bloqueado" (Fallback)
            print("   → Tentando Estratégia 2: Procurando pela mensagem 'O contrato está bloqueado'...")
            elementos_bloqueado = self.driver.find_elements(By.XPATH, "//*[contains(text(), 'O contrato está bloqueado') or contains(text(), 'contrato está bloqueado')]")
            
            if elementos_bloqueado:
                print(f"   ✓ Mensagem de contrato bloqueado encontrada!")
                print("   → Procurando pelo ícone de cadeado ou link de desbloqueio próximo...")
                
                # Procurar pelo elemento pai que contém o cadeado
                try:
                    elemento_bloqueado = elementos_bloqueado[0]
                    
                    # Procurar pelo link de desbloqueio (cadeado aberto) dentro do mesmo painel/card
                    xpath_fallback = "ancestor::div[contains(@class, 'panel') or contains(@class, 'card') or contains(@class, 'box')]//i[contains(@class, 'fa-unlock') or contains(@class, 'fa-lock-open')]/ancestor::a[1]"
                    botoes = elemento_bloqueado.find_elements(By.XPATH, xpath_fallback)
                    
                    if botoes:
                        print(f"   ✓ {len(botoes)} botão(ões) de desbloqueio encontrado(s) na seção de Contratos.")
                        print("   → Clicando no primeiro botão...")
                        
                        botao = botoes[0]
                        self.driver.execute_script("arguments[0].scrollIntoView(true);", botao)
                        time.sleep(1)
                        self.driver.execute_script("arguments[0].click();", botao)
                        time.sleep(2)
                        self.tirar_screenshot("05_apos_clicar_desbloqueio_fallback")
                        
                        # Procurar por botão de confirmação no pop-up
                        print("   → Aguardando pop-up de confirmação...")
                        time.sleep(1)
                        
                        botoes_confirmar = self.driver.find_elements(By.XPATH, 
                            "//button[contains(text(), 'Confirmar') or contains(text(), 'confirmar') or contains(text(), 'Sim') or contains(text(), 'OK') or contains(text(), 'Desbloquear') or contains(text(), 'desbloquear')] | //a[contains(text(), 'Confirmar') or contains(text(), 'Sim')]"
                        )
                        
                        if botoes_confirmar:
                            print(f"   ✓ Botão de confirmação encontrado!")
                            print("   → Clicando no botão de confirmação...")
                            botao_conf = botoes_confirmar[0]
                            self.driver.execute_script("arguments[0].scrollIntoView(true);", botao_conf)
                            time.sleep(1)
                            self.driver.execute_script("arguments[0].click();", botao_conf)
                            time.sleep(2)
                            self.tirar_screenshot("06_apos_confirmar_desbloqueio_fallback")
                            print("\n   ✓ Desbloqueio de Confiança realizado com SUCESSO!")
                            return True
                        else:
                            print("   ✗ Botão de confirmação não encontrado.")
                            self.tirar_screenshot("06_erro_botao_confirmacao_fallback")
                            return False
                    else:
                        print("   ✗ Nenhum botão de desbloqueio encontrado na seção de Contratos.")
                        return False
                        
                except Exception as e:
                    print(f"   ✗ Erro ao processar elemento bloqueado na Estratégia 2: {e}")
                    return False
            else:
                print("   ✗ Mensagem de contrato bloqueado não encontrada. Desbloqueio não necessário ou indisponível.")
                return False
                
        except Exception as e:
            print(f"   ✗ Erro ao tentar desbloqueio: {e}")
            self.tirar_screenshot("05_erro_desbloqueio")
            return False
    
    def executar_fluxo_completo(self):
        """
        Executa o fluxo completo: Login -> Buscar Faturas -> Desbloqueio.
        """
        print("\n" + "="*70)
        print("AUTOMAÇÃO CENTRAL DO ASSINANTE - IXC SOFT")
        print("="*70)
        print(f"Data/Hora: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
        print(f"Screenshots: {self.screenshots_dir}")
        print("="*70)
        
        # Passo 1: Fazer Login
        if not self.fazer_login():
            print("\n✗ Erro: Não foi possível fazer login. Encerrando...")
            self.driver.quit()
            return
        
        # Passo 2: Buscar Faturas
        faturas = self.buscar_faturas_em_aberto()
        
        if faturas:
            print("\n" + "="*70)
            print("FATURAS EM ABERTO")
            print("="*70)
            for i, fatura in enumerate(faturas, 1):
                print(f"\n{i}. {fatura}")
            
            # Passo 3: Oferecer Desbloqueio de Confiança
            print("\n" + "="*70)
            # Retorna a solicitação de credenciais
            resposta = input("\nDeseja realizar o Desbloqueio de Confiança? (s/n): ").lower().strip()
            
            if resposta == 's':
                self.realizar_desbloqueio_confianca()
            else:
                print("Desbloqueio de Confiança não solicitado.")
        else:
            print("\n✗ Não há faturas em aberto.")
        
        print("\n" + "="*70)
        print("Automação concluída!")
        print("Fechando navegador em 5 segundos...")
        print("="*70)
        time.sleep(5)
        self.driver.quit()

def solicitar_credenciais():
    """
    Solicita o CPF e a senha do cliente via terminal.
    """
    print("\n" + "="*70)
    print("CENTRAL DO ASSINANTE - AUTOMAÇÃO IXC SOFT")
    print("="*70)
    print("\nPor favor, insira suas credenciais:")
    print("-" * 70)
    
    while True:
        cpf = input("\nCPF (somente números): ").strip()
        cpf = ''.join(filter(str.isdigit, cpf))
        if cpf.isdigit() and len(cpf) == 11:
            print(f"✓ CPF válido: {cpf}")
            break
        else:
            print("✗ CPF inválido! Digite 11 dígitos numéricos.")
    
    while True:
        try:
            senha = getpass.getpass("Senha (não será exibida): ")
        except Exception:
            senha = input("Senha: ")
            
        if len(senha) > 0:
            print("✓ Senha inserida")
            break
        else:
            print("✗ Senha não pode estar vazia!")
    
    return cpf, senha

def main():
    """
    Função principal para executar a automação.
    """
    try:
        cpf, senha = solicitar_credenciais()
        # Usar headless=False para que o usuário possa ver o navegador (opcional)
        automacao = CentralAssinanteAutomacao(cpf, senha, headless=False) 
        automacao.executar_fluxo_completo()
        
    except KeyboardInterrupt:
        print("\n\n✗ Automação cancelada pelo usuário.")
        sys.exit(0)
    except Exception as e:
        print(f"\n✗ Erro fatal: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
