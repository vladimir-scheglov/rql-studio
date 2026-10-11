import { CstParser, type CstNode } from "chevrotain";
import {
  allTokens,
  And,
  As,
  Asc,
  AtAlias,
  Between,
  BooleanLiteral,
  By,
  Comma,
  Desc,
  Dot,
  Equals,
  From,
  Full,
  Greater,
  GreaterEq,
  Group,
  Having,
  Identifier,
  In,
  Inner,
  Is,
  Join,
  LBracket,
  Left,
  Less,
  LessEq,
  Like,
  Limit,
  LParen,
  Minus,
  Not,
  NotEquals,
  Null,
  NumberLiteral,
  Offset,
  On,
  Or,
  Order,
  Percent,
  Plus,
  RBracket,
  Right,
  RParen /* ... */,
  RqlDirective,
  Select,
  Semicolon,
  Slash,
  Star,
  StringLiteral,
  Where,
} from "./tokens";

export class RqlParser extends CstParser {
  constructor() {
    super(allTokens);
    this.performSelfAnalysis();
  }

  public program = this.RULE("program", () => {
    this.OPTION(() => this.CONSUME(RqlDirective));
    this.SUBRULE(this.expression);
    this.OPTION2(() => this.CONSUME(Semicolon));
  });

  public expression = this.RULE("expression", () => {
    this.OR([
      {
        GATE: () =>
          this.LA(1).tokenType === Select && this.LA(2).tokenType !== LParen,
        ALT: () => this.SUBRULE(this.selectStatement),
      },
      { ALT: () => this.SUBRULE(this.orExpr) },
    ]);
  });

  public selectStatement = this.RULE("selectStatement", () => {
    this.CONSUME(Select);
    this.MANY_SEP({
      SEP: Comma,
      DEF: () => this.SUBRULE(this.orExpr),
    });
    this.MANY(() => this.SUBRULE(this.selectClause));
  });

  public selectClause = this.RULE("selectClause", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.fromClause) },
      {
        // JOIN как оператор: только если это не вызов функции join(...)
        GATE: () =>
          this.LA(1).tokenType === Join && this.LA(2).tokenType !== LParen,
        ALT: () => this.SUBRULE(this.joinClause),
      },
      { ALT: () => this.SUBRULE(this.whereClause) },
      { ALT: () => this.SUBRULE(this.groupByClause) },
      { ALT: () => this.SUBRULE(this.orderByClause) },
      { ALT: () => this.SUBRULE(this.limitClause) },
    ]);
  });

  public fromClause = this.RULE("fromClause", () => {
    this.CONSUME(From);
    this.SUBRULE(this.orExpr);
  });

  public joinClause = this.RULE("joinClause", () => {
    this.OPTION(() =>
      this.OR([
        { ALT: () => this.CONSUME(Inner) },
        { ALT: () => this.CONSUME(Left) },
        { ALT: () => this.CONSUME(Right) },
        { ALT: () => this.CONSUME(Full) },
      ]),
    );
    this.CONSUME(Join);
    this.SUBRULE(this.orExpr);
    this.OPTION2(() => {
      this.CONSUME(On);
      this.SUBRULE2(this.orExpr);
    });
  });

  public whereClause = this.RULE("whereClause", () => {
    this.CONSUME(Where);
    this.SUBRULE(this.orExpr);
  });

  public groupByClause = this.RULE("groupByClause", () => {
    this.CONSUME(Group);
    this.CONSUME(By);
    this.MANY_SEP({
      SEP: Comma,
      DEF: () => this.SUBRULE(this.orExpr),
    });
  });

  public orderByClause = this.RULE("orderByClause", () => {
    this.CONSUME(Order);
    this.CONSUME(By);
    this.MANY_SEP({
      SEP: Comma,
      DEF: () => this.SUBRULE(this.orderByField),
    });
  });

  public orderByField = this.RULE("orderByField", () => {
    this.SUBRULE(this.orExpr);
    this.OPTION(() =>
      this.OR([
        { ALT: () => this.CONSUME(Asc) },
        { ALT: () => this.CONSUME(Desc) },
      ]),
    );
  });

  public limitClause = this.RULE("limitClause", () => {
    this.CONSUME(Limit);
    this.CONSUME(NumberLiteral);
    this.OPTION(() => {
      this.CONSUME(Offset);
      this.CONSUME2(NumberLiteral);
    });
  });

  public orExpr = this.RULE("orExpr", () => {
    this.SUBRULE(this.andExpr);
    this.MANY(() => {
      this.CONSUME(Or);
      this.SUBRULE2(this.andExpr);
    });
  });

  public andExpr = this.RULE("andExpr", () => {
    this.SUBRULE(this.notExpr);
    this.MANY(() => {
      this.CONSUME(And);
      this.SUBRULE2(this.notExpr);
    });
  });

  public notExpr = this.RULE("notExpr", () => {
    this.OPTION(() => this.CONSUME(Not));
    this.SUBRULE(this.comparison);
  });

  public comparison = this.RULE("comparison", () => {
    this.SUBRULE(this.additive);
    this.OPTION(() => {
      this.OR([
        { ALT: () => this.CONSUME(Equals) },
        { ALT: () => this.CONSUME(NotEquals) },
        { ALT: () => this.CONSUME(LessEq) },
        { ALT: () => this.CONSUME(GreaterEq) },
        { ALT: () => this.CONSUME(Less) },
        { ALT: () => this.CONSUME(Greater) },
      ]);
      this.SUBRULE2(this.additive);
    });
    this.OPTION2(() => this.SUBRULE(this.inOrBetweenOrLike));
  });

  public inOrBetweenOrLike = this.RULE("inOrBetweenOrLike", () => {
    this.OR([
      {
        ALT: () => {
          this.CONSUME(In);
          this.SUBRULE(this.additive);
        },
      },
      {
        ALT: () => {
          this.CONSUME(Like);
          this.SUBRULE2(this.additive);
        },
      },
      {
        ALT: () => {
          this.CONSUME(Is);
          this.OPTION(() => this.CONSUME(Not));
          this.CONSUME(Null);
        },
      },
      {
        ALT: () => {
          this.CONSUME(Between);
          this.SUBRULE3(this.additive);
          this.CONSUME(And);
          this.SUBRULE4(this.additive);
        },
      },
    ]);
  });

  public additive = this.RULE("additive", () => {
    this.SUBRULE(this.multiplicative);
    this.MANY(() => {
      this.OR([
        { ALT: () => this.CONSUME(Plus) },
        { ALT: () => this.CONSUME(Minus) },
      ]);
      this.SUBRULE2(this.multiplicative);
    });
  });

  public multiplicative = this.RULE("multiplicative", () => {
    this.SUBRULE(this.primary);
    this.MANY(() => {
      this.OR([
        { ALT: () => this.CONSUME(Star) },
        { ALT: () => this.CONSUME(Slash) },
        { ALT: () => this.CONSUME(Percent) },
      ]);
      this.SUBRULE2(this.primary);
    });
  });

  public primary = this.RULE("primary", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.parenExpr) },
      { ALT: () => this.SUBRULE(this.functionCall) },
      { ALT: () => this.SUBRULE(this.aliasRef) },
      { ALT: () => this.SUBRULE(this.arrayLiteral) },
      { ALT: () => this.SUBRULE(this.literal) },
      { ALT: () => this.SUBRULE(this.identifierRef) },
      { ALT: () => this.SUBRULE(this.keywordAsIdentifier) },
    ]);
  });

  public keywordAsIdentifier = this.RULE("keywordAsIdentifier", () => {
    this.OR([
      { ALT: () => this.CONSUME(On) },
      { ALT: () => this.CONSUME(Asc) },
      { ALT: () => this.CONSUME(Desc) },
      { ALT: () => this.CONSUME(By) },
      { ALT: () => this.CONSUME(From) },
      { ALT: () => this.CONSUME(Where) },
      { ALT: () => this.CONSUME(Group) },
      { ALT: () => this.CONSUME(Order) },
      { ALT: () => this.CONSUME(Having) },
      { ALT: () => this.CONSUME(Limit) },
      { ALT: () => this.CONSUME(Offset) },
      { ALT: () => this.CONSUME(Join) },
      { ALT: () => this.CONSUME(Inner) },
      { ALT: () => this.CONSUME(Left) },
      { ALT: () => this.CONSUME(Right) },
      { ALT: () => this.CONSUME(Full) },
      { ALT: () => this.CONSUME(Select) },
      { ALT: () => this.CONSUME(As) },
    ]);
  });

  public parenExpr = this.RULE("parenExpr", () => {
    this.CONSUME(LParen);
    this.SUBRULE(this.expression);
    this.CONSUME(RParen);
  });

  public functionCall = this.RULE("functionCall", () => {
    this.OR([
      { ALT: () => this.CONSUME(Identifier) },
      // SQL-ключевые слова, которые могут быть именами функций в RQL
      { ALT: () => this.CONSUME(Select) },
      { ALT: () => this.CONSUME(From) },
      { ALT: () => this.CONSUME(Where) },
      { ALT: () => this.CONSUME(Group) },
      { ALT: () => this.CONSUME(Order) },
      { ALT: () => this.CONSUME(Limit) },
      { ALT: () => this.CONSUME(Join) },
      { ALT: () => this.CONSUME(Inner) },
      { ALT: () => this.CONSUME(Left) },
      { ALT: () => this.CONSUME(Right) },
      { ALT: () => this.CONSUME(Full) },
      { ALT: () => this.CONSUME(On) },
      { ALT: () => this.CONSUME(Asc) },
      { ALT: () => this.CONSUME(Desc) },
      { ALT: () => this.CONSUME(By) },
      { ALT: () => this.CONSUME(Offset) },
    ]);

    this.CONSUME(LParen);
    this.MANY_SEP({
      SEP: Comma,
      DEF: () => this.SUBRULE(this.expression),
    });
    this.CONSUME(RParen);
  });

  public aliasRef = this.RULE("aliasRef", () => {
    this.CONSUME(AtAlias);
    this.MANY({
      GATE: () =>
        this.LA(1).tokenType === Dot && this.LA(2).tokenType === Identifier,
      DEF: () => {
        this.CONSUME(Dot);
        this.CONSUME(Identifier);
      },
    });
  });

  public identifierRef = this.RULE("identifierRef", () => {
    this.CONSUME(Identifier);
  });

  public arrayLiteral = this.RULE("arrayLiteral", () => {
    this.CONSUME(LBracket);
    this.MANY_SEP({
      SEP: Comma,
      DEF: () => this.SUBRULE(this.expression),
    });
    this.CONSUME(RBracket);
  });

  public literal = this.RULE("literal", () => {
    this.OR([
      { ALT: () => this.CONSUME(StringLiteral) },
      { ALT: () => this.CONSUME(NumberLiteral) },
      { ALT: () => this.CONSUME(BooleanLiteral) },
      { ALT: () => this.CONSUME(Null) },
    ]);
  });
}

export const rqlParser = new RqlParser();
