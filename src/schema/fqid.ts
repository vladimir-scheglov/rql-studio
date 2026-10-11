export interface FqidParts {
  domain?: string;
  entity: string;
  attribute?: string;
}

/**
 * Разбирает FQID вида:
 *  - "Incident"                              -> entity
 *  - "dictionaries.test/IncidentTypeDict"    -> domain + entity
 *  - "dictionaries.test/IncidentTypeDict.fullName" -> domain + entity + attribute
 *  - "Incident.incidentId"                   -> entity + attribute
 */
export function parseFqid(input: string): FqidParts {
  if (!input) return { entity: "" };

  const slashIdx = input.indexOf("/");
  let domain: string | undefined;
  let rest = input;

  if (slashIdx !== -1) {
    domain = input.slice(0, slashIdx);
    rest = input.slice(slashIdx + 1);
  }

  const dotIdx = rest.indexOf(".");
  if (dotIdx === -1) {
    return { domain, entity: rest };
  }

  return {
    domain,
    entity: rest.slice(0, dotIdx),
    attribute: rest.slice(dotIdx + 1),
  };
}

export function buildFqid(parts: FqidParts, currentDomain: string): string {
  const domain =
    parts.domain && parts.domain !== currentDomain ? parts.domain : undefined;
  const entity = parts.entity ?? "";
  const attribute = parts.attribute ? `.${parts.attribute}` : "";
  return domain ? `${domain}/${entity}${attribute}` : `${entity}${attribute}`;
}
