import pandas as pd
import sys
import io

# Set UTF-8 encoding for console output
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

files = [
    '교원_발령사항_현황_20251126_175246.xlsx',
    '구분 및 보직명 기준.xlsx'
]

for file_path in files:
    try:
        print(f"\n{'#'*80}")
        print(f"File: {file_path}")
        print('#'*80)
        
        # Load the excel file
        xl = pd.ExcelFile(file_path)
        print(f"Sheet names: {xl.sheet_names}")
        
        for sheet in xl.sheet_names:
            print(f"\n{'-'*40}")
            print(f"Sheet: {sheet}")
            print('-'*40)
            df = xl.parse(sheet)
            print(f"Total rows: {len(df)}")
            print(f"Total columns: {len(df.columns)}")
            print("\nColumns:")
            print(df.columns.tolist())
            
            print("\nFirst 5 rows:")
            print(df.head().to_string())
            
    except Exception as e:
        print(f"Error reading {file_path}: {e}")
