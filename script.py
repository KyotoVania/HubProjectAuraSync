import os

def bundle_files(start_path, output_file):
    """
    Traverses a directory, reads all files, and writes their content
    to a single output file, with a header indicating the original file path.
    """
    with open(output_file, 'w', encoding='utf-8') as outfile:
        for dirpath, _, filenames in os.walk(start_path):
            for filename in filenames:
                filepath = os.path.join(dirpath, filename)
                relative_filepath = os.path.relpath(filepath, start_path)
                
                try:
                    with open(filepath, 'r', encoding='utf-8') as infile:
                        outfile.write(f"--- {relative_filepath} ---\n")
                        outfile.write(infile.read())
                        outfile.write("\n\n")
                except Exception as e:
                    print(f"Could not read file {filepath}: {e}")

if __name__ == "__main__":
    source_directory = 'src'
    output_filename = 'Code_Bundle.txt'
    
    if os.path.isdir(source_directory):
        bundle_files(source_directory, output_filename)
        print(f"All files from '{source_directory}' have been bundled into '{output_filename}'")
    else:
        print(f"Error: The directory '{source_directory}' does not exist.")
