"""CLI entry point for running the analytics pipeline directly without the web app."""

import argparse
import sys
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the analytics pipeline on a data file.")
    parser.add_argument(
        "--input",
        required=True,
        type=Path,
        help="Path to the input data file (CSV, Excel, JSON, or Parquet)",
    )
    parser.add_argument(
        "--run-id",
        required=True,
        type=str,
        help="Unique identifier for this pipeline run",
    )
    args = parser.parse_args()

    if not args.input.exists():
        print(f"Error: input file '{args.input}' does not exist.", file=sys.stderr)
        sys.exit(1)

    print(f"Starting pipeline: run_id={args.run_id}, input={args.input}")
    # Orchestrator will be wired in Step 9
    print("Pipeline complete.")


if __name__ == "__main__":
    main()
