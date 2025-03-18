import JSZip from "jszip";
export const readMWBFile = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const zip = await JSZip.loadAsync(reader.result as ArrayBuffer);
        const modelXml = await zip.file("document.mwb.xml")?.async("text");
        if (!modelXml) throw new Error("Invalid MWB file structure");

        resolve(modelXml);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
};

export const extractMWBContent = (fileContent: string) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(fileContent, "application/xml");

  const tables = Array.from(
    doc.querySelectorAll('value[struct-name="db.mysql.Table"]')
  );

  // Generate SQL content
  const sqlContent = generateSQL(tables);

  // Generate Laravel models - one per table
  const laravelModels = tables.map((table) => {
    let tableName =
      table
        .querySelector(
          'value[struct-name="db.mysql.Table"] > value[key="name"]'
        )
        ?.textContent?.trim() || "UNKNOWN_TABLE";
    return {
      name: `${pascalCase(tableName)}.php`,
      content: generateLaravelModel(table),
      type: "model" as const,
    };
  });

  // Generate individual migration files for each table
  const migrations = tables.map((table) => {
    let tableName =
      table
        .querySelector(
          'value[struct-name="db.mysql.Table"] > value[key="name"]'
        )
        ?.textContent?.trim() || "UNKNOWN_TABLE";
    return {
      name: `${Date.now()}_create_${tableName.toLowerCase()}_table.php`,
      content: generateSingleTableMigration(table),
      type: "migration" as const,
    };
  });

  return {
    sqlContent,
    laravelModels,
    migrations,
  };
};

function generateSQL(tables: Element[]): string {
  const dataTypeMap = {
    VARCHAR: (length: string) => `VARCHAR(${length})`,
    CHAR: (length: string) => `CHAR(${length})`,
    INT: (length: string) => `INT(${length || "11"})`,
    BIGINT: (length: string) => `BIGINT(${length || "20"})`,
    TINYINT: (length: string) => `TINYINT(${length || "4"})`,
    DECIMAL: (precision: string, scale: string) =>
      `DECIMAL(${precision || "10"},${scale || "2"})`,
    TEXT: () => "TEXT",
    LONGTEXT: () => "LONGTEXT",
    TIMESTAMP: () => "TIMESTAMP",
    DATETIME: () => "DATETIME",
    DATE: () => "DATE",
    FLOAT: () => "FLOAT",
    DOUBLE: () => "DOUBLE",
    BOOLEAN: () => "BOOLEAN",
    JSON: () => "JSON",
  };

  return tables
    .map((table) => {
      // Get schema name and table name from the correct structure
      const schemaName = "GrtObject"; // You can customize this
      // Get table name directly from the name value
      let tableName =
        table
          .querySelector(
            'value[struct-name="db.mysql.Table"] > value[key="name"]'
          )
          ?.textContent?.trim() || "UNKNOWN_TABLE";

      tableName = tableName.replace(/\s*[\[\(].*?[\]\)]\s*/g, "").trim();

      const columns = Array.from(
        table.querySelectorAll('value[struct-name="db.mysql.Column"]')
      ).map((col) => {
        const colName = col
          .querySelector('value[key="name"]')
          ?.textContent?.trim();
        const simpleType = col
          .querySelector('link[key="simpleType"]')
          ?.textContent?.trim()
          ?.split(".")
          .pop()
          ?.toUpperCase();
        const length = col
          .querySelector('value[key="length"]')
          ?.textContent?.trim();
        const isNotNull =
          col.querySelector('value[key="isNotNull"]')?.textContent === "1";
        const autoIncrement =
          col.querySelector('value[key="autoIncrement"]')?.textContent === "1";
        const unsigned =
          col.querySelector('value[key="unsigned"]')?.textContent === "1";
        const defaultValue = col
          .querySelector('value[key="defaultValue"]')
          ?.textContent?.trim();
        const comment = col
          .querySelector('value[key="comment"]')
          ?.textContent?.trim();

        let columnDef = `\`${colName}\` `;

        // Inside generateSQL function, update the data type handling section:

        if (simpleType === "TIMESTAMP_F") {
          columnDef += "TIMESTAMP";
        } else if (simpleType === "BIGINT") {
          columnDef += `BIGINT(20)${unsigned ? " UNSIGNED" : ""}`; // Fixed length for BIGINT
        } else if (simpleType === "VARCHAR") {
          columnDef += `VARCHAR(${length || "255"})`;
        } else if (simpleType === "TINYINT") {
          columnDef += `TINYINT(1)${unsigned ? " UNSIGNED" : ""}`; // Fixed length for TINYINT
        } else if (simpleType === "INT") {
          columnDef += `INT(11)${unsigned ? " UNSIGNED" : ""}`; // Standard INT length
        } else {
          columnDef += simpleType || "VARCHAR(255)";
        }

        if (autoIncrement) columnDef += " AUTO_INCREMENT";
        columnDef += isNotNull ? " NOT NULL" : " NULL";
        if (defaultValue) columnDef += ` DEFAULT ${defaultValue}`;
        // if (comment) columnDef += ` COMMENT '${comment}'`;

        return columnDef;
      });

      return `CREATE TABLE IF NOT EXISTS \`${tableName}\` (
  ${[...columns].join(",\n  ")}
)`;
    })
    .join("\n\n");
}
function generateLaravelModel(table: Element): string {
  let tableName =
    table
      .querySelector('value[struct-name="db.mysql.Table"] > value[key="name"]')
      ?.textContent?.trim() || "UNKNOWN_TABLE";
  const className = pascalCase(tableName);

  // Get columns for fillable
  const columns = Array.from(
    table.querySelectorAll('value[struct-name="db.mysql.Column"]')
  ).map(
    (col) =>
      col.querySelector('value[key="name"]')?.textContent?.trim() ||
      "unknown_column"
  );

  // Filter out id, created_at, updated_at for fillable
  const fillableColumns = columns.filter(
    (col) => !["id", "created_at", "updated_at"].includes(col)
  );

  return `<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Factories\\HasFactory;
use Illuminate\\Database\\Eloquent\\Model;

class ${className} extends Model
{
    use HasFactory;

    /**
     * The table associated with the model.
     *
     * @var string
     */
    protected $table = '${tableName}';

    /**
     * The attributes that are mass assignable.
     *
     * @var array
     */
    protected $fillable = [
        ${fillableColumns.map((col) => `'${col}'`).join(",\n        ")}
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array
     */
    protected $casts = [
        // Add your casts here
    ];
}`;
}
function generateSingleTableMigration(table: Element): string {
  let tableName =
    table
      .querySelector('value[struct-name="db.mysql.Table"] > value[key="name"]')
      ?.textContent?.trim() || "UNKNOWN_TABLE";

  const className = `Create${pascalCase(tableName)}Table`;

  // Get columns for the migration
  const columns = Array.from(
    table.querySelectorAll('value[struct-name="db.mysql.Column"]')
  );

  // Generate migration schema based on columns
  const schemaLines = columns
    .map((col) => {
      const colName = col
        .querySelector('value[key="name"]')
        ?.textContent?.trim();
      const simpleType = col
        .querySelector('link[key="simpleType"]')
        ?.textContent?.trim()
        ?.split(".")
        .pop()
        ?.toUpperCase();
      const length = col
        .querySelector('value[key="length"]')
        ?.textContent?.trim();
      const isNotNull =
        col.querySelector('value[key="isNotNull"]')?.textContent === "1";
      const autoIncrement =
        col.querySelector('value[key="autoIncrement"]')?.textContent === "1";
      const unsigned =
        col.querySelector('value[key="unsigned"]')?.textContent === "1";
      const defaultValue = col
        .querySelector('value[key="defaultValue"]')
        ?.textContent?.trim();

      // Skip id column as it's added separately
      if (colName === "id" && autoIncrement) {
        return null;
      }

      let line = `            $table->`;

      // Map MySQL types to Laravel migration types
      if (simpleType === "VARCHAR") {
        line += `string('${colName}'${length ? `, ${length}` : ""})`;
      } else if (simpleType === "INT" || simpleType === "BIGINT") {
        if (unsigned) {
          line += `unsignedInteger('${colName}')`;
        } else {
          line += `integer('${colName}')`;
        }
      } else if (simpleType === "TINYINT" && length === "1") {
        line += `boolean('${colName}')`;
      } else if (simpleType === "TEXT") {
        line += `text('${colName}')`;
      } else if (simpleType === "LONGTEXT") {
        line += `longText('${colName}')`;
      } else if (simpleType === "DECIMAL") {
        line += `decimal('${colName}', 10, 2)`;
      } else if (simpleType === "TIMESTAMP" || simpleType === "TIMESTAMP_F") {
        line += `timestamp('${colName}')`;
      } else if (simpleType === "DATETIME") {
        line += `dateTime('${colName}')`;
      } else if (simpleType === "DATE") {
        line += `date('${colName}')`;
      } else if (simpleType === "JSON") {
        line += `json('${colName}')`;
      } else {
        // Default to string for unknown types
        line += `string('${colName}')`;
      }

      // Add modifiers
      if (!isNotNull) {
        line += "->nullable()";
      }

      if (defaultValue) {
        if (defaultValue === "NULL") {
          line += "->default(null)";
        } else if (defaultValue === "CURRENT_TIMESTAMP") {
          line += "->useCurrent()";
        } else {
          line += `->default('${defaultValue}')`;
        }
      }

      line += ";";
      return line;
    })
    .filter(Boolean); // Remove null entries

  return `<?php

use Illuminate\\Database\\Migrations\\Migration;
use Illuminate\\Database\\Schema\\Blueprint;
use Illuminate\\Support\\Facades\\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('${tableName}', function (Blueprint $table) {
            $table->id();
${schemaLines.join("\n")}
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('${tableName}');
    }
};`;
}

function generateMigration(tables: Element[]): string {
  const sqlStatements = generateSQL(tables);
  return `<?php

use Illuminate\\Database\\Migrations\\Migration;
use Illuminate\\Database\\Schema\\Blueprint;
use Illuminate\\Support\\Facades\\Schema;

class Create${Date.now()}Tables extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        // Generated SQL statements
        // ${sqlStatements.replace(/\n/g, "\n        // ")}
        
        ${tables
          .map((table) => {
            const tableName =
              table.querySelector('value[key="name"]')?.textContent?.trim() ||
              "unknown_table";
            return `Schema::create('${tableName}', function (Blueprint $table) {
            $table->id();
            // Add your columns here
            $table->timestamps();
        });`;
          })
          .join("\n\n        ")}
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        ${tables
          .map((table) => {
            const tableName =
              table.querySelector('value[key="name"]')?.textContent?.trim() ||
              "unknown_table";
            return `Schema::dropIfExists('${tableName}');`;
          })
          .reverse()
          .join("\n        ")}
    }
}`;
}

function pascalCase(str: string): string {
  return str.replace(/(^|_)(\w)/g, (_, __, letter) => letter.toUpperCase());
}
