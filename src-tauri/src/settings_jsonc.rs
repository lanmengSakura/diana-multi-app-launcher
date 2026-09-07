use serde_json::Value;

#[derive(Clone)]
struct Token {
    raw: String,
    start: usize,
    end: usize,
}
struct Property {
    key: String,
    key_start: usize,
    start: usize,
    end: usize,
    comma: Option<Token>,
}
pub struct Document {
    properties: Vec<Property>,
    close: usize,
}

pub fn inspect(text: &str) -> Result<Document, String> {
    let bytes = text.as_bytes();
    let mut i = if text.starts_with('\u{feff}') { 3 } else { 0 };
    let mut tokens: Vec<Token> = Vec::new();
    while i < bytes.len() {
        if bytes[i].is_ascii_whitespace() {
            i += 1;
            continue;
        }
        if text[i..].starts_with("//") {
            i = text[i..]
                .find('\n')
                .map(|offset| i + offset)
                .unwrap_or(bytes.len());
            continue;
        }
        if text[i..].starts_with("/*") {
            i += 2;
            i += text[i..].find("*/").ok_or("设置文件注释未闭合。")? + 2;
            continue;
        }
        let start = i;
        if bytes[i] == b'"' {
            i += 1;
            while i < bytes.len() && bytes[i] != b'"' {
                if bytes[i] == b'\\' {
                    i += 1;
                }
                i += 1;
            }
            if i >= bytes.len() {
                return Err("设置文件字符串未闭合。".into());
            }
            i += 1;
        } else if b"{}[]:,".contains(&bytes[i]) {
            i += 1;
        } else {
            while i < bytes.len()
                && !bytes[i].is_ascii_whitespace()
                && !b"{}[]:,/".contains(&bytes[i])
            {
                i += 1;
            }
        }
        if i == start {
            return Err("设置文件含无效 JSONC。".into());
        }
        tokens.push(Token {
            raw: text[start..i].into(),
            start,
            end: i,
        });
    }
    let normalized = tokens
        .iter()
        .enumerate()
        .filter(|(n, t)| {
            !(t.raw == ","
                && tokens
                    .get(n + 1)
                    .map(|next| next.raw == "}" || next.raw == "]")
                    .unwrap_or(false))
        })
        .map(|(_, t)| t.raw.as_str())
        .collect::<Vec<_>>()
        .join(" ");
    let value: Value =
        serde_json::from_str(&normalized).map_err(|_| "设置文件不是有效 JSONC，未改写。")?;
    if !value.is_object() {
        return Err("设置文件必须是 JSON 对象。".into());
    }
    let mut properties: Vec<Property> = Vec::new();
    let mut n = 1;
    while n < tokens.len() - 1 {
        let key_token = &tokens[n];
        let key: String = serde_json::from_str(&key_token.raw).map_err(|_| "设置键无效。")?;
        if properties.iter().any(|p| p.key == key) {
            return Err("设置文件有重复顶层键，未改写。".into());
        }
        n += 2;
        let start = tokens[n].start;
        let mut depth = 0;
        loop {
            match tokens[n].raw.as_str() {
                "{" | "[" => depth += 1,
                "}" | "]" => depth -= 1,
                _ => {}
            }
            n += 1;
            if depth <= 0 {
                break;
            }
        }
        let end = tokens[n - 1].end;
        let comma = if tokens[n].raw == "," {
            let c = tokens[n].clone();
            n += 1;
            Some(c)
        } else {
            None
        };
        properties.push(Property {
            key,
            key_start: key_token.start,
            start,
            end,
            comma,
        });
    }
    Ok(Document {
        properties,
        close: tokens.last().ok_or("空设置文件。")?.start,
    })
}

pub fn raw_value(text: &str, key: &str) -> Option<String> {
    inspect(text)
        .ok()?
        .properties
        .iter()
        .find(|p| p.key == key)
        .map(|p| text[p.start..p.end].into())
}

pub fn edit(text: &str, key: &str, raw: Option<&str>) -> Result<String, String> {
    let document = inspect(text)?;
    if let Some(value) = raw {
        serde_json::from_str::<Value>(value).map_err(|_| "主题值无效。")?;
    }
    let entry = document.properties.iter().position(|p| p.key == key);
    let mut result = text.to_string();
    match (entry, raw) {
        (Some(index), Some(value)) => {
            let p = &document.properties[index];
            result.replace_range(p.start..p.end, value);
        }
        (Some(index), None) => {
            let p = &document.properties[index];
            result.replace_range(
                p.key_start..p.comma.as_ref().map(|c| c.end).unwrap_or(p.end),
                "",
            );
            if p.comma.is_none() && index > 0 {
                if let Some(c) = &document.properties[index - 1].comma {
                    result.replace_range(c.start..c.end, "");
                }
            }
        }
        (None, Some(value)) => {
            let newline = if text.contains("\r\n") { "\r\n" } else { "\n" };
            result.insert_str(
                document.close,
                &format!(
                    "{newline}  {}: {value}{newline}",
                    serde_json::to_string(key).unwrap()
                ),
            );
            if let Some(p) = document.properties.last() {
                if p.comma.is_none() {
                    result.insert(p.end, ',');
                }
            }
        }
        _ => {}
    }
    inspect(&result)?;
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preserves_compact_and_nested_user_values() {
        for source in [
            "{}",
            "{\"x\":1}",
            "{// keep\n\"nested\":{\"theme\":\"ignore\"},\"x\":[1,2,],}",
            "\u{feff}{\"字\":\"值\"}",
        ] {
            let changed = edit(source, "theme", Some("\"Diana\"")).unwrap();
            assert_eq!(raw_value(&changed, "theme"), Some("\"Diana\"".into()));
            let restored = edit(&changed, "theme", None).unwrap();
            assert_eq!(raw_value(&restored, "x"), raw_value(source, "x"));
            assert_eq!(raw_value(&restored, "nested"), raw_value(source, "nested"));
            assert!(inspect(&restored).is_ok());
        }
    }
    #[test]
    fn removes_only_selected_property() {
        for text in [
            "{\"theme\":1,\"other\":2}",
            "{\"other\":2,\"theme\":1}",
            "{\"theme\":1,/*note*/\"other\":2,}",
        ] {
            let restored = edit(text, "theme", None).unwrap();
            assert_eq!(raw_value(&restored, "other"), Some("2".into()));
        }
    }
    #[test]
    fn rejects_invalid_input() {
        for text in ["[]", "{\"x\":}", "{\"x\":1,\"x\":2}", "{/*", "{\"x\":\"}"] {
            assert!(inspect(text).is_err());
        }
    }
}
