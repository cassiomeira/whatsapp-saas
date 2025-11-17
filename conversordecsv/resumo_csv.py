import pandas as pd
import sys
import os

def resumir_csv(input_file, output_file):
    """
    Lê um arquivo CSV de estoque, extrai colunas específicas e salva em um novo CSV
    com o formato (sku, name, price, quantity, description).

    Args:
        input_file (str): Caminho para o arquivo CSV de entrada.
        output_file (str): Caminho para o arquivo CSV de saída.
    """
    # Mapeamento das colunas do CSV original (índice baseado em 0) para as colunas desejadas
    # 1: SKU interno (código do produto) -> sku
    # 2: Descrição do Produto -> name
    # 15: Valor Unitário -> price
    # 8: Quantidade em Estoque -> quantity
    # 3: Fabricante/Marca (usado como description) -> description
    colunas_para_extrair = [1, 2, 15, 8, 3]

    # Nomes das novas colunas
    novas_colunas = ['sku', 'name', 'price', 'quantity', 'description']

    try:
        # 1. Ler o arquivo CSV
        # - sep=';': O arquivo usa ponto e vírgula como separador.
        # - header=None: O arquivo não tem cabeçalho na primeira linha.
        # - skiprows=1: Pula a primeira linha que contém cabeçalhos indesejados.
        # - decimal=',': O arquivo usa vírgula como separador decimal.
        df = pd.read_csv(
            input_file,
            sep=';',
            encoding='utf-8',
            header=None,
            skiprows=1,
            decimal=','
        )

        # 2. Selecionar e renomear as colunas
        df_resumo = df[colunas_para_extrair].copy()
        df_resumo.columns = novas_colunas

        # 3. Limpar e formatar a coluna 'price'
        # Garante que é um float com 2 casas decimais
        df_resumo['price'] = df_resumo['price'].astype(float).round(2)

        # 4. Limpar e formatar a coluna 'quantity'
        # Converte para inteiro, tratando valores NaN como 0
        df_resumo['quantity'] = df_resumo['quantity'].fillna(0).astype(str).str.replace(',', '.').str.replace(' ', '').apply(lambda x: int(float(x)) if x and x != 'nan' else 0)

        # 5. Salvar o resultado em um novo arquivo CSV
        # - sep=',': Usa vírgula como separador (padrão CSV).
        # - decimal='.': Usa ponto como separador decimal (padrão CSV).
        df_resumo.to_csv(
            output_file,
            index=False,
            sep=',',
            encoding='utf-8',
            decimal='.'
        )

        print(f'Sucesso! O arquivo resumido foi salvo em: {output_file}')

    except FileNotFoundError:
        print(f'Erro: Arquivo de entrada não encontrado em {input_file}', file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f'Ocorreu um erro durante o processamento: {e}', file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    # Define os caminhos dos arquivos
    # Você pode alterar 'EstoqueFisico_utf8_novo.csv' para o nome do seu arquivo de entrada
    # e 'EstoqueFisico_Resumo_final.csv' para o nome do arquivo de saída desejado.
    input_csv = 'EstoqueFisico_utf8_novo.csv'
    output_csv = 'EstoqueFisico_Resumo_final.csv'

    # Verifica se o arquivo de entrada existe
    if not os.path.exists(input_csv):
        print(f'Atenção: O arquivo de entrada "{input_csv}" não foi encontrado. Certifique-se de que o nome do arquivo está correto e que ele está no mesmo diretório do script.', file=sys.stderr)
        sys.exit(1)

    resumir_csv(input_csv, output_csv)
