import os
import pandas as pd
import argparse
import json

def csv_to_json(directory, output_file, renames=None):
    """
    Reads multiple CSV files from the specified directory, converts their contents into
    a JSON dictionary format, and writes the output to a JSON file.
    
    Parameters:
    directory (str): Path to the directory containing CSV files.
    output_file (str): Path to the output JSON file.
    """
    colors_dict = {}
    colorRenames = {}
    if(renames):
        with open(renames, "r", encoding="utf-8") as f:
            colorRenames = json.load(f)
    for filename in os.listdir(directory):
        if filename.endswith(".csv"):
            filepath = os.path.join(directory, filename)
            df = pd.read_csv(filepath, header=None, dtype=int)
            
            # Convert CSV to space-separated string
            color_str = "\n".join(" ".join(map(str, row)) for row in df.values)
            
            # Add to dictionary without .csv extension
            key = os.path.splitext(filename)[0]
            if key in colorRenames:
                key = f"{key}_{colorRenames[key]}"
            elif key.endswith("s"):
                # if ends in s, use the first letter of the color add (S) to the end of the key
                newKey = key[:-1]
                if newKey in colorRenames:
                    key = f"{key}_{colorRenames[newKey]}(S)"
            colors_dict[key] = color_str
    
    # Write to output file as JSON
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(colors_dict, f, indent=4)
    
    print(f"JSON file '{output_file}' created successfully!")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Convert CSV files to a JSON dictionary format.")
    parser.add_argument("input_directory", type=str, help="Path to the directory containing CSV files.")
    parser.add_argument("output_file", type=str, help="Path to the output JSON file.")
    parser.add_argument("--renames", type=str, help="Path to a JSON file containing renames for the colors.", default=None)
    args = parser.parse_args()
    csv_to_json(args.input_directory, args.output_file, args.renames)