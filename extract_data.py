import pandas as pd
import json
import sys
import io
import re
import os
import glob
import math

# Set UTF-8 encoding for console output
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def find_latest_files():
    # Find raw data file (converted xlsx)
    raw_files = glob.glob('교원_발령사항_현황_*.xlsx')
    if not raw_files:
        print("Error: No raw data file found matching '교원_발령사항_현황_*.xlsx'")
        return None, None
    
    # Sort by name (which includes date) to get latest
    raw_file = sorted(raw_files)[-1]
    
    # Find criteria file
    criteria_file = '구분 및 보직명 기준.xlsx'
    if not os.path.exists(criteria_file):
        print(f"Error: Criteria file '{criteria_file}' not found")
        return None, None
        
    return raw_file, criteria_file

def extract_date_from_filename(filename):
    # Pattern: 교원_발령사항_현황_YYYYMMDD_HHMMSS.xlsx
    match = re.search(r'(\d{4})(\d{2})(\d{2})', filename)
    if match:
        year, month, day = match.groups()
        return f'({year}.{month}.{day}.)', int(f'{year}{month}{day}')
    return '(날짜 없음)', None

def find_header_row(file_path):
    # Find header row dynamically
    df_temp = pd.read_excel(file_path, header=None, nrows=10)
    for idx, row in df_temp.iterrows():
        if '성명' in row.values:
            return idx
    return -1

def normalize_position(pos):
    """Normalize position name for better matching"""
    if pd.isna(pos):
        return ''
    s = str(pos).strip()
    # Remove extra spaces and normalize
    s = ' '.join(s.split())
    # Remove spaces for comparison (we'll create both versions)
    return s

def normalize_for_comparison(pos):
    """Remove all spaces for comparison"""
    if pd.isna(pos):
        return ''
    s = str(pos).strip()
    # Remove ALL spaces
    s = s.replace(' ', '')
    # Remove special characters like (주)
    s = s.replace('(주)', '')
    return s

def find_best_match(criteria_pos, raw_positions_list, debug=False):
    """
    Find best match for a criteria position in raw data
    Try multiple matching strategies
    """
    criteria_norm = normalize_position(criteria_pos)
    criteria_comp = normalize_for_comparison(criteria_pos)
    
    if debug:
        print(f"\nSearching for: '{criteria_pos}'")
        print(f"  Normalized: '{criteria_norm}'")
        print(f"  For comparison: '{criteria_comp}'")
    
    best_match = None
    best_score = 0
    
    for raw_data in raw_positions_list:
        raw_pos = raw_data['position']
        raw_norm = normalize_position(raw_pos)
        raw_comp = normalize_for_comparison(raw_pos)
        
        score = 0
        
        # Strategy 1: Exact match (highest priority)
        if criteria_norm == raw_norm:
            score = 100
        # Strategy 2: Match without spaces
        elif criteria_comp == raw_comp:
            score = 90
        # Strategy 3: Criteria contains raw (e.g., "대학원 경영학과장" contains "경영학과장")
        elif criteria_comp.endswith(raw_comp) and len(raw_comp) > 3:
            score = 80
        # Strategy 4: Raw contains criteria
        elif raw_comp.endswith(criteria_comp) and len(criteria_comp) > 3:
            score = 70
        # Strategy 5: Partial match
        elif criteria_comp in raw_comp or raw_comp in criteria_comp:
            # Calculate similarity
            if len(criteria_comp) > 0 and len(raw_comp) > 0:
                overlap = len(set(criteria_comp) & set(raw_comp))
                total = len(set(criteria_comp) | set(raw_comp))
                score = int(60 * overlap / total) if total > 0 else 0
        
        if score > best_score:
            best_score = score
            best_match = raw_data
            if debug:
                print(f"  Match: '{raw_pos}' (score: {score})")
        
    if debug and best_match:
        print(f"  Best match: '{best_match['position']}' (score: {best_score})")
    
    # Only return matches with score >= 70
    return best_match if best_score >= 70 else None

def main():
    raw_file, criteria_file = find_latest_files()
    if not raw_file:
        sys.exit(1)
        
    print(f"Processing raw file: {raw_file}")
    print(f"Using criteria file: {criteria_file}")
    
    date_str, current_date = extract_date_from_filename(raw_file)
    print(f"Extracted date: {date_str} (Value: {current_date})")
    
    if not current_date:
        from datetime import datetime
        current_date = int(datetime.now().strftime('%Y%m%d'))
        print(f"Using current date as fallback: {current_date}")
    
    try:
        # Load criteria
        df_criteria = pd.read_excel(criteria_file, sheet_name='rule')
        print(f"Loaded {len(df_criteria)} criteria items")
        
        # Load raw data
        header_idx = find_header_row(raw_file)
        if header_idx == -1:
            print("Error: Could not find header row with '성명'")
            sys.exit(1)
            
        print(f"Found header at row index {header_idx}")
        df_raw = pd.read_excel(raw_file, header=header_idx)
        print(f"Loaded {len(df_raw)} raw data rows")
        
        # Clean column names (strip whitespace)
        df_raw.columns = df_raw.columns.str.strip()
        df_criteria.columns = df_criteria.columns.str.strip()
        
        # Ensure required columns exist
        required_cols = ['발령직위', '발령시작일', '발령종료일', '성명']
        missing_cols = [col for col in required_cols if col not in df_raw.columns]
        if missing_cols:
            print(f"Error: Missing columns in raw data: {missing_cols}")
            print(f"Available columns: {df_raw.columns.tolist()}")
            sys.exit(1)
            
        # Pre-process raw data dates
        def to_date_int(x):
            try:
                s = str(x).replace('.', '').strip()
                if not s or s == 'nan': return 0
                return int(s)
            except:
                return 0
                
        df_raw['start_date_int'] = df_raw['발령시작일'].apply(to_date_int)
        df_raw['end_date_int'] = df_raw['발령종료일'].apply(lambda x: to_date_int(x) if to_date_int(x) > 0 else 99999999)
        
        # Filter for active appointments
        active_mask = (df_raw['start_date_int'] <= current_date) & (df_raw['end_date_int'] >= current_date)
        df_active = df_raw[active_mask].copy()
        print(f"Filtered {len(df_active)} active appointments")
        
        # Sort by start date descending to prioritize latest appointments
        df_active.sort_values('start_date_int', ascending=False, inplace=True)
        
        # Create a list of all active positions with their data
        raw_positions_list = []
        for _, row in df_active.iterrows():
            pos = row['발령직위']
            if pd.notna(pos) and str(pos).strip():
                raw_positions_list.append({
                    'position': str(pos).strip(),
                    'name': str(row['성명']) if pd.notna(row['성명']) else '',
                    'start': row['발령시작일'],
                    'end': row['발령종료일']
                })
        
        print(f"Total active position records: {len(raw_positions_list)}")
        
        # Process criteria file in order
        results = []
        matched_count = 0
        debug_positions = ['총장', '대학원 경영학과장']  # Debug these
        
        for _, row in df_criteria.iterrows():
            category = str(row['구분']).strip() if pd.notna(row['구분']) else ''
            position = str(row['보 직 명']).strip() if pd.notna(row['보 직 명']) else ''
            
            # Find best match
            debug = position in debug_positions
            match_data = find_best_match(position, raw_positions_list, debug=debug)
            
            name = ''
            period = ''
            
            if match_data:
                matched_count += 1
                name = match_data['name']
                p_start = match_data['start']
                p_end = match_data['end']
                
                def fmt_date(d):
                    if pd.isna(d): return ''
                    s = str(d).strip()
                    return s
                
                period = f"{fmt_date(p_start)}-{fmt_date(p_end)}"
            
            results.append({
                'category': category,
                'position': position,
                'name': name,
                'period': period
            })
            
        print(f"\nMatched {matched_count} positions out of {len(results)}")
        
        # Split into Left/Right columns
        total_items = len(results)
        mid_point = math.ceil(total_items / 2)
        
        left_items = results[:mid_point]
        right_items = results[mid_point:]
        
        # Pad right items if needed
        while len(right_items) < len(left_items):
            right_items.append({'category': '', 'position': '', 'name': '', 'period': ''})
            
        # Create structured data
        data = {
            'title': '교 원 보 직 자 현 황',
            'date': date_str,
            'headers': {
                'left': ['구분', '보 직 명', '성 명', '기 간'],
                'right': ['구분', '보 직 명', '성 명', '기 간']
            },
            'rows': []
        }
        
        for i in range(len(left_items)):
            data['rows'].append({
                'left': left_items[i],
                'right': right_items[i]
            })
            
        # Save to JSON file
        with open('professor_data.json', 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        print(f"✓ Successfully processed {len(data['rows'])} rows")
        print(f"✓ Data saved to professor_data.json")
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
