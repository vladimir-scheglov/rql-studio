import { RqlLexer, allTokens } from "./tokens";
import { rqlParser } from "./parser";
import type { Node } from "./ast";
import { buildAst } from "./build-ast.ts";

export interface ParseResult {
  ast: Node | null;
  lexErrors: any[];
  parseErrors: any[];
}

export function parseRql(input: string): ParseResult {
  const lexResult = RqlLexer.tokenize(input);
  rqlParser.input = lexResult.tokens;
  const cst = rqlParser.program();

  if (lexResult.errors.length || rqlParser.errors.length) {
    return {
      ast: null,
      lexErrors: lexResult.errors,
      parseErrors: rqlParser.errors,
    };
  }

  const ast = buildAst(cst, input);
  return { ast, lexErrors: [], parseErrors: [] };
}
