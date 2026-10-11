import { createToken, Lexer } from "chevrotain";

export const RqlDirective = createToken({
  name: "RqlDirective",
  pattern: /!rql/,
  line_breaks: false,
});

export const WhiteSpace = createToken({
  name: "WhiteSpace",
  pattern: /\s+/,
  group: Lexer.SKIPPED,
});

export const LineComment = createToken({
  name: "LineComment",
  pattern: /#[^\n]*/,
  group: Lexer.SKIPPED,
});

// Литералы
export const StringLiteral = createToken({
  name: "StringLiteral",
  pattern: /'([^']|'')*'/,
});

export const NumberLiteral = createToken({
  name: "NumberLiteral",
  pattern: /-?\d+(\.\d+)?/,
});

export const BooleanLiteral = createToken({
  name: "BooleanLiteral",
  pattern: /\b(true|false)\b/,
});

// Псевдонимы @doc, @CurrentUser.id, @enumIocTypes.Account
export const AtAlias = createToken({
  name: "AtAlias",
  pattern: /@[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*/,
});

// Идентификатор
export const Identifier = createToken({
  name: "Identifier",
  pattern: /[A-Za-z_][\w]*/,
});

// Операторы
export const Equals = createToken({ name: "Equals", pattern: /=/ });
export const NotEquals = createToken({ name: "NotEquals", pattern: /!=|<>/ });
export const LessEq = createToken({ name: "LessEq", pattern: /<=/ });
export const GreaterEq = createToken({ name: "GreaterEq", pattern: />=/ });
export const Less = createToken({ name: "Less", pattern: /</ });
export const Greater = createToken({ name: "Greater", pattern: />/ });
export const Plus = createToken({ name: "Plus", pattern: /\+/ });
export const Minus = createToken({ name: "Minus", pattern: /-/ });
export const Star = createToken({ name: "Star", pattern: /\*/ });
export const Slash = createToken({ name: "Slash", pattern: /\// });
export const Percent = createToken({ name: "Percent", pattern: /%/ });

export const LParen = createToken({ name: "LParen", pattern: /\(/ });
export const RParen = createToken({ name: "RParen", pattern: /\)/ });
export const Comma = createToken({ name: "Comma", pattern: /,/ });
export const Dot = createToken({ name: "Dot", pattern: /\./ });
export const Semicolon = createToken({ name: "Semicolon", pattern: /;/ });
export const LBracket = createToken({ name: "LBracket", pattern: /\[/ });
export const RBracket = createToken({ name: "RBracket", pattern: /\]/ });

// Ключевые слова — регистронезависимо
export const And = createToken({
  name: "And",
  pattern: /\bAND\b/i,
  longer_alt: Identifier,
});
export const Or = createToken({
  name: "Or",
  pattern: /\bOR\b/i,
  longer_alt: Identifier,
});
export const Not = createToken({
  name: "Not",
  pattern: /\bNOT\b/i,
  longer_alt: Identifier,
});
export const In = createToken({
  name: "In",
  pattern: /\bIN\b/i,
  longer_alt: Identifier,
});
export const Is = createToken({
  name: "Is",
  pattern: /\bIS\b/i,
  longer_alt: Identifier,
});
export const Null = createToken({
  name: "Null",
  pattern: /\bNULL\b/i,
  longer_alt: Identifier,
});
export const Like = createToken({
  name: "Like",
  pattern: /\bLIKE\b/i,
  longer_alt: Identifier,
});
export const Between = createToken({
  name: "Between",
  pattern: /\bBETWEEN\b/i,
  longer_alt: Identifier,
});
export const Select = createToken({
  name: "Select",
  pattern: /\bSELECT\b/i,
  longer_alt: Identifier,
});
export const From = createToken({
  name: "From",
  pattern: /\bFROM\b/i,
  longer_alt: Identifier,
});
export const Where = createToken({
  name: "Where",
  pattern: /\bWHERE\b/i,
  longer_alt: Identifier,
});
export const Group = createToken({
  name: "Group",
  pattern: /\bGROUP\b/i,
  longer_alt: Identifier,
});
export const By = createToken({
  name: "By",
  pattern: /\bBY\b/i,
  longer_alt: Identifier,
});
export const Having = createToken({
  name: "Having",
  pattern: /\bHAVING\b/i,
  longer_alt: Identifier,
});
export const Order = createToken({
  name: "Order",
  pattern: /\bORDER\b/i,
  longer_alt: Identifier,
});
export const Asc = createToken({
  name: "Asc",
  pattern: /\bASC\b/i,
  longer_alt: Identifier,
});
export const Desc = createToken({
  name: "Desc",
  pattern: /\bDESC\b/i,
  longer_alt: Identifier,
});
export const Limit = createToken({
  name: "Limit",
  pattern: /\bLIMIT\b/i,
  longer_alt: Identifier,
});
export const Offset = createToken({
  name: "Offset",
  pattern: /\bOFFSET\b/i,
  longer_alt: Identifier,
});
export const Join = createToken({
  name: "Join",
  pattern: /\bJOIN\b/i,
  longer_alt: Identifier,
});
export const Inner = createToken({
  name: "Inner",
  pattern: /\bINNER\b/i,
  longer_alt: Identifier,
});
export const Left = createToken({
  name: "Left",
  pattern: /\bLEFT\b/i,
  longer_alt: Identifier,
});
export const Right = createToken({
  name: "Right",
  pattern: /\bRIGHT\b/i,
  longer_alt: Identifier,
});
export const Full = createToken({
  name: "Full",
  pattern: /\bFULL\b/i,
  longer_alt: Identifier,
});
export const On = createToken({
  name: "On",
  pattern: /\bON\b/i,
  longer_alt: Identifier,
});
export const As = createToken({
  name: "As",
  pattern: /\bAS\b/i,
  longer_alt: Identifier,
});
export const Interval = createToken({
  name: "Interval",
  pattern: /\bINTERVAL\b/i,
  longer_alt: Identifier,
});

// Порядок важен: длинные альтернативы идут раньше коротких
export const allTokens = [
  WhiteSpace,
  LineComment,
  RqlDirective,
  StringLiteral,
  NumberLiteral,
  AtAlias,
  BooleanLiteral,

  // Операторы — до Identifier
  NotEquals,
  LessEq,
  GreaterEq,
  Equals,
  Less,
  Greater,
  Plus,
  Minus,
  Star,
  Slash,
  Percent,

  LParen,
  RParen,
  Comma,
  Dot,
  Semicolon,
  LBracket,
  RBracket,

  // Ключевые слова — до Identifier
  And,
  Or,
  Not,
  In,
  Is,
  Null,
  Like,
  Between,
  Select,
  From,
  Where,
  Group,
  By,
  Having,
  Order,
  Asc,
  Desc,
  Limit,
  Offset,
  Join,
  Inner,
  Left,
  Right,
  Full,
  On,
  As,
  Interval,

  Identifier,
];

export const RqlLexer = new Lexer(allTokens, {
  positionTracking: "full",
});
