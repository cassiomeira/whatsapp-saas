import pandas as pd
import sys
import os

def resumir_csv(input_file, output_file):
    colunas_para_extrair = [1, 2, 15, 8, 3]
    novas_colunas = ['sku', 'name', 'price', 'quantity', 'description']

    try:
        # tenta utf-8, se falhar usa latin1
        try:
            df = pd.read_csv(input_file, sep=';', encoding='utf-8', header=None, skiprows=1, decimal=',')
        except UnicodeDecodeError:
            df = pd.read_csv(input_file, sep=';', encoding='latin1', header=None, skiprows=1, decimal=',')

        df_resumo = df[colunas_para_extrair].copy()
        df_resumo.columns = novas_colunas
        df_resumo['price'] = df_resumo['price'].astype(float).round(2)

        df_resumo['quantity'] = (
            df_resumo['quantity']
            .fillna(0)
            .astype(str)
            .str.replace(',', '.')
            .str.replace(' ', '')
            .apply(lambda x: int(float(x)) if x and x != 'nan' else 0)
        )

        df_resumo.to_csv(output_file, index=False, sep=',', encoding='utf-8', decimal='.')

        print(f"✔ Arquivo convertido com sucesso!\n📁 Saída: {output_file}")

    except Exception as e:
        print(f"Ocorreu um erro durante o processamento: {e}")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso correto:")
        print("  python resumo_csv.py caminho_do_arquivo.csv")
        sys.exit(1)

    input_csv = sys.argv[1]

    if not os.path.exists(input_csv):
        print(f"Erro: arquivo '{input_csv}' não encontrado.")
        sys.exit(1)

    output_csv = "EstoqueFisico_Resumo_final.csv"

    resumir_csv(input_csv, output_csv)
