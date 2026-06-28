import { sqlParam, executeSql } from "./sql";

export type TableAvailability = {
  exists: boolean;
  columns: Set<string>;
};

export async function getTableAvailability(
  tableName: string,
): Promise<TableAvailability> {
  const result = await executeSql<{ column_name: string }>({
    sql: `
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = :tableName
      order by ordinal_position
    `,
    parameters: [sqlParam("tableName", tableName)],
  });

  return {
    exists: result.rows.length > 0,
    columns: new Set(result.rows.map((row) => String(row.column_name))),
  };
}

export function requiredColumnsAvailable(
  availability: TableAvailability,
  requiredColumns: readonly string[],
): boolean {
  return (
    availability.exists &&
    requiredColumns.every((column) => availability.columns.has(column))
  );
}

export function publicErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown database error";
}
