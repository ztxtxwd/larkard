/** Official Feishu card JSON Schema validator ($def dialect). Test helper only. */

type JsonValue =
    | null
    | boolean
    | number
    | string
    | JsonValue[]
    | { [key: string]: JsonValue };

type JsonObject = { [key: string]: JsonValue };

type ValidationIssue = {
  path: string;
  property?: string;
  keyword: string;
  message: string;
  schemaPath?: string;
  expected?: string;
  actual?: string;
  allowedValues?: JsonValue[];
};


function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function appendPath(path: string, property: string | number): string {
  if (typeof property === 'number') {
    return `${path}[${property}]`;
  }

  if (/^[A-Za-z_$][0-9A-Za-z_$]*$/.test(property)) {
    return `${path}.${property}`;
  }

  return `${path}[${JSON.stringify(property)}]`;
}

function appendSchemaPath(schemaPath: string, property: string | number): string {
  return `${schemaPath}/${String(property).replace(/~/g, '~0').replace(/\//g, '~1')}`;
}

function pathProperty(path: string): string | undefined {
  const dotMatch = /\.([A-Za-z_$][0-9A-Za-z_$]*)$/.exec(path);
  if (dotMatch) {
    return dotMatch[1];
  }

  const quotedMatch = /\[("(?:\\.|[^"\\])*")\]$/.exec(path);
  if (quotedMatch) {
    try {
      const value = JSON.parse(quotedMatch[1]) as unknown;
      return typeof value === 'string' ? value : undefined;
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function makeIssue(
    path: string,
    keyword: string,
    message: string,
    overrides: Partial<ValidationIssue> = {},
): ValidationIssue {
  return {
    path,
    property: pathProperty(path),
    keyword,
    message,
    ...overrides,
  };
}

function actualType(value: JsonValue): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return typeof value;
}

function expectedTypes(schema: JsonObject): string[] | undefined {
  const typeKeyword = schema.type;
  if (typeof typeKeyword === 'string') {
    return [typeKeyword];
  }
  if (Array.isArray(typeKeyword) && typeKeyword.every((item) => typeof item === 'string')) {
    return typeKeyword as string[];
  }
  return undefined;
}

function typeMatches(value: JsonValue, expected: string): boolean {
  if (expected === 'integer') {
    return typeof value === 'number' && Number.isInteger(value);
  }
  return actualType(value) === expected;
}

function jsonEquals(left: JsonValue, right: JsonValue): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function formatJson(value: JsonValue): string {
  return JSON.stringify(value);
}

function formatAllowed(values: JsonValue[]): string {
  return values.map(formatJson).join(', ');
}

function issueKey(issue: ValidationIssue): string {
  return [
    issue.path,
    issue.property ?? '',
    issue.keyword,
    issue.message,
    issue.schemaPath ?? '',
  ].join('\0');
}

function dedupeIssues(issues: ValidationIssue[]): ValidationIssue[] {
  const seen = new Set<string>();
  const output: ValidationIssue[] = [];
  for (const issue of issues) {
    const key = issueKey(issue);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(issue);
  }
  return output;
}

class SchemaValidator {
  private readonly root: JsonObject;

  constructor(root: JsonValue) {
    if (!isRecord(root)) {
      throw new Error('schema 顶层必须是对象');
    }
    this.root = root;
  }

  validate(value: JsonValue, path = '$', schema: JsonValue = this.root, schemaPath = '#'): ValidationIssue[] {
    return dedupeIssues(this.validateNode(value, schema, path, schemaPath));
  }

  private validateNode(
      value: JsonValue,
      schemaValue: JsonValue,
      path: string,
      schemaPath: string,
  ): ValidationIssue[] {
    if (schemaValue === true) {
      return [];
    }

    if (schemaValue === false) {
      return [makeIssue(path, 'falseSchema', '该位置不允许出现任何值', { schemaPath })];
    }

    if (!isRecord(schemaValue)) {
      return [];
    }

    const ref = schemaValue.$ref;
    if (typeof ref === 'string') {
      const resolved = this.resolveRef(ref);
      return this.validateNode(value, resolved.schema, path, resolved.schemaPath);
    }

    const oneOf = schemaValue.oneOf;
    if (Array.isArray(oneOf)) {
      return this.validateOneOf(value, oneOf, path, appendSchemaPath(schemaPath, 'oneOf'));
    }

    const issues: ValidationIssue[] = [];
    const types = expectedTypes(schemaValue);
    if (types) {
      const matches = types.some((type) => typeMatches(value, type));
      if (!matches) {
        issues.push(
            makeIssue(path, 'type', `类型必须是 ${types.join(' 或 ')}，实际是 ${actualType(value)}`, {
              schemaPath: appendSchemaPath(schemaPath, 'type'),
              expected: types.join('|'),
              actual: actualType(value),
            }),
        );
        return issues;
      }
    }

    if ('const' in schemaValue && !jsonEquals(value, schemaValue.const)) {
      issues.push(
          makeIssue(path, 'const', `值必须等于 ${formatJson(schemaValue.const)}`, {
            schemaPath: appendSchemaPath(schemaPath, 'const'),
            expected: formatJson(schemaValue.const),
            actual: formatJson(value),
          }),
      );
    }

    if (Array.isArray(schemaValue.enum) && !schemaValue.enum.some((item) => jsonEquals(value, item))) {
      issues.push(
          makeIssue(path, 'enum', `值必须是以下之一：${formatAllowed(schemaValue.enum)}`, {
            schemaPath: appendSchemaPath(schemaPath, 'enum'),
            allowedValues: schemaValue.enum,
            actual: formatJson(value),
          }),
      );
    }

    if (isRecord(value)) {
      issues.push(...this.validateObject(value, schemaValue, path, schemaPath));
    }

    if (Array.isArray(value)) {
      issues.push(...this.validateArray(value, schemaValue, path, schemaPath));
    }

    return issues;
  }

  private validateObject(
      value: JsonObject,
      schema: JsonObject,
      path: string,
      schemaPath: string,
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const properties = isRecord(schema.properties) ? schema.properties : undefined;
    const required = Array.isArray(schema.required)
        ? schema.required.filter((item): item is string => typeof item === 'string')
        : [];

    for (const property of required) {
      if (!Object.prototype.hasOwnProperty.call(value, property)) {
        issues.push(
            makeIssue(appendPath(path, property), 'required', `缺少必填属性 ${property}`, {
              property,
              schemaPath: appendSchemaPath(schemaPath, 'required'),
            }),
        );
      }
    }

    if (properties) {
      for (const [property, propertySchema] of Object.entries(properties)) {
        if (!Object.prototype.hasOwnProperty.call(value, property)) {
          continue;
        }
        issues.push(
            ...this.validateNode(
                value[property],
                propertySchema,
                appendPath(path, property),
                appendSchemaPath(appendSchemaPath(schemaPath, 'properties'), property),
            ),
        );
      }
    }

    if (schema.additionalProperties === false) {
      for (const property of Object.keys(value)) {
        if (properties && Object.prototype.hasOwnProperty.call(properties, property)) {
          continue;
        }
        issues.push(
            makeIssue(appendPath(path, property), 'additionalProperties', `不允许出现额外属性 ${property}`, {
              property,
              schemaPath: appendSchemaPath(schemaPath, 'additionalProperties'),
            }),
        );
      }
    } else if (isRecord(schema.additionalProperties)) {
      for (const property of Object.keys(value)) {
        if (properties && Object.prototype.hasOwnProperty.call(properties, property)) {
          continue;
        }
        issues.push(
            ...this.validateNode(
                value[property],
                schema.additionalProperties,
                appendPath(path, property),
                appendSchemaPath(schemaPath, 'additionalProperties'),
            ),
        );
      }
    }

    return issues;
  }

  private validateArray(
      value: JsonValue[],
      schema: JsonObject,
      path: string,
      schemaPath: string,
  ): ValidationIssue[] {
    if (!isRecord(schema.items)) {
      return [];
    }

    const issues: ValidationIssue[] = [];
    value.forEach((item, index) => {
      issues.push(
          ...this.validateNode(item, schema.items, appendPath(path, index), appendSchemaPath(schemaPath, 'items')),
      );
    });
    return issues;
  }

  private validateOneOf(
      value: JsonValue,
      branches: JsonValue[],
      path: string,
      schemaPath: string,
  ): ValidationIssue[] {
    const allowedTags = this.collectConstPropertyValues(branches, 'tag');
    if (
        isRecord(value) &&
        typeof value.tag === 'string' &&
        allowedTags.length > 0 &&
        !allowedTags.some((tag) => jsonEquals(tag, value.tag))
    ) {
      return [
        makeIssue(appendPath(path, 'tag'), 'oneOf', `无法匹配组件 tag ${formatJson(value.tag)}；支持：${allowedTags.join(', ')}`, {
          property: 'tag',
          schemaPath,
          allowedValues: allowedTags,
          actual: formatJson(value.tag),
        }),
      ];
    }

    const selectedIndex = this.selectBranch(value, branches);
    if (selectedIndex !== undefined) {
      return this.validateNode(
          value,
          branches[selectedIndex],
          path,
          appendSchemaPath(schemaPath, selectedIndex),
      );
    }

    const results = branches.map((branch, index) => ({
      index,
      branch,
      issues: this.validateNode(value, branch, path, appendSchemaPath(schemaPath, index)),
    }));

    const validResults = results.filter((result) => result.issues.length === 0);
    if (validResults.length > 0) {
      // The card schema uses oneOf to model unions. Some branches are not fully
      // discriminated, so accepting one-or-more matches gives practical union
      // behavior while still using the schema's branch definitions.
      return [];
    }

    const best = this.bestResult(results, value);
    if (best && best.issues.length > 0) {
      return best.issues;
    }

    return [
      makeIssue(path, 'oneOf', '必须匹配 schema 的其中一个分支', {
        schemaPath,
      }),
    ];
  }

  private selectBranch(value: JsonValue, branches: JsonValue[]): number | undefined {
    if (!isRecord(value)) {
      return undefined;
    }

    const tag = typeof value.tag === 'string' ? value.tag : undefined;
    if (tag) {
      const matches = branches
          .map((branch, index) => ({ index, constValue: this.constProperty(branch, 'tag') }))
          .filter((branch): branch is { index: number; constValue: JsonValue } => branch.constValue === tag);
      if (matches.length === 1) {
        return matches[0].index;
      }
    }

    const type = typeof value.type === 'string' ? value.type : undefined;
    if (type) {
      const normalizedType = normalizeName(type);
      const titleMatches = branches
          .map((branch, index) => ({ index, title: this.branchTitle(branch) }))
          .filter(({ title }) => title && normalizeName(title).includes(normalizedType));
      if (titleMatches.length === 1) {
        return titleMatches[0].index;
      }
    }

    const scored = branches.map((branch, index) => ({
      index,
      score: this.branchPropertyScore(value, branch),
    }));
    scored.sort((left, right) => right.score - left.score);
    if (scored[0] && scored[0].score > 0 && scored[0].score > (scored[1]?.score ?? -Infinity)) {
      return scored[0].index;
    }

    return undefined;
  }

  private bestResult(
      results: Array<{ index: number; branch: JsonValue; issues: ValidationIssue[] }>,
      value: JsonValue,
  ): { index: number; branch: JsonValue; issues: ValidationIssue[] } | undefined {
    const sorted = [...results].sort((left, right) => {
      const leftWeight = this.issueWeight(left.issues) - this.branchPropertyScore(value, left.branch);
      const rightWeight = this.issueWeight(right.issues) - this.branchPropertyScore(value, right.branch);
      return leftWeight - rightWeight;
    });
    return sorted[0];
  }

  private issueWeight(issues: ValidationIssue[]): number {
    return issues.reduce((total, issue) => {
      if (issue.keyword === 'const' && issue.property === 'tag') {
        return total + 10;
      }
      if (issue.keyword === 'additionalProperties') {
        return total + 6;
      }
      if (issue.keyword === 'type' || issue.keyword === 'enum' || issue.keyword === 'const') {
        return total + 4;
      }
      if (issue.keyword === 'required') {
        return total + 2;
      }
      return total + 1;
    }, 0);
  }

  private branchPropertyScore(value: JsonValue, branch: JsonValue): number {
    if (!isRecord(value)) {
      return 0;
    }

    const dereferenced = this.dereference(branch);
    const schema = dereferenced.schema;
    if (!isRecord(schema) || !isRecord(schema.properties)) {
      return 0;
    }

    let score = 0;
    for (const key of Object.keys(value)) {
      if (Object.prototype.hasOwnProperty.call(schema.properties, key)) {
        score += key === 'tag' || key === 'type' ? 2 : 4;
      } else {
        score -= 3;
      }
    }

    const required = Array.isArray(schema.required)
        ? schema.required.filter((item): item is string => typeof item === 'string')
        : [];
    for (const key of required) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        score += 1;
      }
    }

    return score;
  }

  private collectConstPropertyValues(branches: JsonValue[], property: string): JsonValue[] {
    const values: JsonValue[] = [];
    for (const branch of branches) {
      const constValue = this.constProperty(branch, property);
      if (constValue !== undefined && !values.some((value) => jsonEquals(value, constValue))) {
        values.push(constValue);
      }
    }
    return values.sort((left, right) => String(left).localeCompare(String(right)));
  }

  private constProperty(branch: JsonValue, property: string): JsonValue | undefined {
    const dereferenced = this.dereference(branch);
    const schema = dereferenced.schema;
    if (!isRecord(schema) || !isRecord(schema.properties)) {
      return undefined;
    }
    const propertySchema = schema.properties[property];
    if (!isRecord(propertySchema) || !('const' in propertySchema)) {
      return undefined;
    }
    return propertySchema.const;
  }

  private branchTitle(branch: JsonValue): string | undefined {
    const dereferenced = this.dereference(branch);
    return isRecord(dereferenced.schema) && typeof dereferenced.schema.title === 'string'
        ? dereferenced.schema.title
        : undefined;
  }

  private dereference(schema: JsonValue): { schema: JsonValue; schemaPath: string } {
    if (!isRecord(schema) || typeof schema.$ref !== 'string') {
      return { schema, schemaPath: '#' };
    }
    return this.resolveRef(schema.$ref);
  }

  private resolveRef(ref: string): { schema: JsonValue; schemaPath: string } {
    if (!ref.startsWith('#')) {
      throw new Error(`暂不支持外部 schema 引用：${ref}`);
    }

    if (ref === '#') {
      return { schema: this.root, schemaPath: '#' };
    }

    const pointer = ref.slice(2);
    const parts = pointer
        ? pointer.split('/').map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
        : [];

    let current: JsonValue = this.root;
    let schemaPath = '#';
    for (const part of parts) {
      if (!isRecord(current) && !Array.isArray(current)) {
        throw new Error(`schema 引用无效：${ref}`);
      }

      const next = (current as JsonObject | JsonValue[])[part as keyof (JsonObject | JsonValue[])];
      if (next === undefined) {
        throw new Error(`schema 引用不存在：${ref}`);
      }
      current = next;
      schemaPath = appendSchemaPath(schemaPath, part);
    }

    return { schema: current, schemaPath };
  }
}
function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}


export type { ValidationIssue, JsonValue };

export function validateOfficialCard(
  card: JsonValue,
  schema: JsonValue,
): ValidationIssue[] {
  const validator = new SchemaValidator(schema);
  return validator.validate(card);
}
