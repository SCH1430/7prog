// A bounded interpreter for the linear Python subset used by this course.
// No eval, Function, network, filesystem, imports, loops or arbitrary host calls.
(function (root) {
  'use strict';
  const fail = message => { throw new Error(message); };
  const val = (type, value) => ({ type, value });
  const number = (type, value) => {
    if (!Number.isFinite(value) || Math.abs(value) > 1e12) fail('Число слишком велико для учебной песочницы.');
    return val(type, Object.is(value, -0) ? 0 : value);
  };
  const numeric = v => ['int', 'float', 'bool'].includes(v.type);
  const truth = v => v.type === 'list' || v.type === 'str' ? v.value.length > 0 : Boolean(v.value);
  function repr(v) {
    if (v.type === 'str') return `'${v.value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\t/g, '\\t')}'`;
    return display(v);
  }
  function display(v) {
    if (v.type === 'bool') return v.value ? 'True' : 'False';
    if (v.type === 'float') return Number.isInteger(v.value) ? `${v.value}.0` : String(v.value);
    if (v.type === 'list') return `[${v.value.map(repr).join(', ')}]`;
    if (v.type === 'none') return 'None';
    return String(v.value);
  }
  function tokenize(source) {
    const tokens = [];
    let i = 0;
    while (i < source.length) {
      if (/\s/.test(source[i])) { i++; continue; }
      if (source[i] === '#') break;
      const c = source[i];
      if (c === '"' || c === "'") {
        const quote = source[i++];
        let text = ''; let closed = false;
        while (i < source.length) {
          const ch = source[i++];
          if (ch === quote) { closed = true; break; }
          if (ch === '\\') {
            const escape = source[i++];
            const map = { n: '\n', t: '\t', r: '\r', '\\': '\\', '"': '"', "'": "'" };
            if (!(escape in map)) fail('Используй обычные символы или экранирование \\n, \\t, \\, кавычек.');
            text += map[escape];
          } else text += ch;
        }
        if (!closed) fail('Не закрыты кавычки строки.');
        tokens.push({ kind: 'literal', value: val('str', text) });
      } else {
        const tail = source.slice(i);
        const n = tail.match(/^(?:\d+\.\d*|\.\d+|\d+)/);
        const id = tail.match(/^[A-Za-z_][A-Za-z_0-9]*/);
        const op = tail.match(/^(\*\*|\/\/|==|!=|<=|>=|[+\-*\/%<>=(),\[\]])/);
        if (n) {
          if (/^0\d+$/.test(n[0]) && Number(n[0]) !== 0) fail('В целом числе не должно быть ведущих нулей.');
          tokens.push({ kind: 'literal', value: number(n[0].includes('.') ? 'float' : 'int', Number(n[0])) }); i += n[0].length;
        } else if (id) { tokens.push({ kind: 'id', text: id[0] }); i += id[0].length; }
        else if (op) { tokens.push({ kind: 'op', text: op[0] }); i += op[0].length; }
        else fail(`Символ «${c}» не поддерживается. Проверь раскладку и синтаксис.`);
      }
      if (tokens.length > 400) fail('Слишком длинное выражение.');
    }
    tokens.push({ kind: 'end', text: '<конец>' });
    return tokens;
  }
  function parse(tokens) {
    let index = 0; let nesting = 0;
    const peek = () => tokens[index];
    const eat = text => { if (peek().text === text) { index++; return true; } return false; };
    const need = text => { if (!eat(text)) fail(`Ожидался символ «${text}».`); };
    function binary(next, ops) {
      let left = next();
      while (ops.includes(peek().text)) { const op = tokens[index++].text; left = { kind: 'binary', op, left, right: next() }; }
      return left;
    }
    const or = () => binary(and, ['or']);
    const and = () => binary(not, ['and']);
    function not() { if (eat('not')) return { kind: 'unary', op: 'not', right: not() }; return compare(); }
    function compare() {
      const values = [sum()]; const ops = [];
      while (['==','!=','<','>','<=','>='].includes(peek().text)) { ops.push(tokens[index++].text); values.push(sum()); }
      return ops.length ? { kind: 'compare', values, ops } : values[0];
    }
    const sum = () => binary(term, ['+', '-']);
    const term = () => binary(unary, ['*', '/', '//', '%']);
    function unary() {
      if (eat('+')) return { kind: 'unary', op: '+', right: unary() };
      if (eat('-')) return { kind: 'unary', op: '-', right: unary() };
      return power();
    }
    function power() { const left = primary(); return eat('**') ? { kind: 'binary', op: '**', left, right: unary() } : left; }
    function primary() {
      if (++nesting > 35) fail('Слишком много вложенных скобок.');
      let node;
      if (eat('(')) { node = or(); need(')'); }
      else if (eat('[')) {
        const items = [];
        if (!eat(']')) { do { if (peek().text === ']') break; items.push(or()); } while (eat(',')); need(']'); }
        node = { kind: 'list', items };
      } else if (peek().kind === 'literal') node = { kind: 'literal', value: tokens[index++].value };
      else if (peek().kind === 'id') {
        const name = tokens[index++].text;
        if (['True','False'].includes(name)) node = { kind: 'literal', value: val('bool', name === 'True') };
        else if (eat('(')) {
          const args = [];
          if (!eat(')')) { do { if (peek().text === ')') break; args.push(or()); } while (eat(',')); need(')'); }
          node = { kind: 'call', name, args };
        } else node = { kind: 'name', name };
      } else fail('Ожидалось число, строка, переменная или вызов функции.');
      while (eat('[')) { node = { kind: 'index', target: node, index: or() }; need(']'); }
      nesting--; return node;
    }
    let statement;
    if (tokens[0]?.kind === 'id' && tokens[1]?.text === '=') {
      const name = tokens[0].text;
      if (['True','False','None','and','or','not','if','else','for','while','def','class','import','return','print','input','int','float','str','bool','len'].includes(name)) fail('Выбери другое имя переменной.');
      index = 2; statement = { kind: 'assign', name, expression: or() };
    } else statement = { kind: 'expression', expression: or() };
    if (peek().kind !== 'end') fail(`Лишний символ «${peek().text || '?'}». Вводи одну команду на строке.`);
    return statement;
  }
  function arithmetic(op, a, b) {
    if (op === '+' && a.type === b.type && ['str','list'].includes(a.type)) {
      if (a.value.length + b.value.length > 2000) fail('Результат слишком длинный.');
      return val(a.type, a.type === 'str' ? a.value + b.value : [...a.value,...b.value]);
    }
    if (op === '*' && (['str','list'].includes(a.type) || ['str','list'].includes(b.type))) {
      const seq = ['str','list'].includes(a.type) ? a : b;
      const n = seq === a ? b : a;
      if (!['int','bool'].includes(n.type)) fail('Строку или список можно умножить только на целое число.');
      const count = Math.max(0, Number(n.value));
      if (count > 2000 || count * seq.value.length > 2000) fail('Результат слишком длинный.');
      return val(seq.type, seq.type === 'str' ? seq.value.repeat(count) : Array.from({length:count},()=>seq.value).flat());
    }
    if (!numeric(a) || !numeric(b)) fail('Типы не подходят для операции. Проверь int(), float() или str().');
    const x = Number(a.value), y = Number(b.value);
    if (['/','//','%'].includes(op) && y === 0) fail('Делить на ноль нельзя.');
    let type = a.type === 'float' || b.type === 'float' ? 'float' : 'int';
    let result;
    switch (op) {
      case '+': result = x + y; break;
      case '-': result = x - y; break;
      case '*': result = x * y; break;
      case '/': result = x / y; type = 'float'; break;
      case '//': result = Math.floor(x / y); break;
      case '%': result = ((x % y) + y) % y; break;
      case '**': if (Math.abs(y) > 30) fail('Для степени используй показатель от −30 до 30.'); result = x ** y; if (y < 0) type = 'float'; break;
      default: fail('Неизвестная операция.');
    }
    return number(type,result);
  }
  function equal(a,b) {
    if (numeric(a) && numeric(b)) return Number(a.value) === Number(b.value);
    if (a.type !== b.type) return false;
    if (a.type === 'list') return a.value.length === b.value.length && a.value.every((v,i)=>equal(v,b.value[i]));
    return a.value === b.value;
  }
  function run(source, inputs = []) {
    try {
      if (typeof source !== 'string' || source.length > 4000) fail('Программа слишком длинная.');
      const env = Object.create(null); const output = []; let inputAt = 0; let steps = 0;
      const lines = source.replace(/\r\n?/g,'\n').split('\n');
      if (lines.length > 30) fail('В этой песочнице поддерживаются программы до 30 строк.');
      function call(name,args) {
        if (name === 'print') { output.push(args.map(display).join(' ')); return val('none',null); }
        if (name === 'input') {
          if (args.length) fail('В учебных фрагментах используй input() без приглашения.');
          if (inputAt >= inputs.length) fail('Для ещё одного input() не хватает входных данных.');
          return val('str',String(inputs[inputAt++]));
        }
        if (!['int','float','str','bool','len'].includes(name)) fail(`Функция ${name}() не поддерживается в этой учебной песочнице.`);
        if (args.length !== 1) fail(`Для ${name}() укажи один аргумент.`);
        const a = args[0];
        if (name === 'str') return val('str',display(a));
        if (name === 'bool') return val('bool',truth(a));
        if (name === 'len') {
          if (!['str','list'].includes(a.type)) fail('len() ожидает строку или список.');
          return number('int', a.type === 'str' ? [...a.value].length : a.value.length);
        }
        if (a.type === 'list' || a.type === 'none') fail(`Нельзя преобразовать ${a.type} в число.`);
        if (a.type === 'str') {
          const re = name === 'int' ? /^[+-]?\d+$/ : /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
          if (!re.test(a.value.trim())) fail(`Строка не подходит для ${name}(). В дробях Python используй точку.`);
        }
        const n = Number(a.value);
        return number(name,name === 'int' ? Math.trunc(n) : n);
      }
      function evaluate(node) {
        if (++steps > 2000) fail('Выражение слишком сложное.');
        if (node.kind === 'literal') return node.value;
        if (node.kind === 'name') {
          if (!Object.hasOwn(env,node.name)) fail(`Переменная ${node.name} ещё не получила значение.`);
          return env[node.name];
        }
        if (node.kind === 'list') return val('list',node.items.map(evaluate));
        if (node.kind === 'call') return call(node.name,node.args.map(evaluate));
        if (node.kind === 'index') {
          const seq = evaluate(node.target), at = evaluate(node.index);
          if (!['str','list'].includes(seq.type) || !['int','bool'].includes(at.type)) fail('Для индекса нужен список или строка и целое число.');
          const items = seq.type === 'str' ? [...seq.value] : seq.value;
          const idx = Number(at.value) < 0 ? items.length + Number(at.value) : Number(at.value);
          if (idx < 0 || idx >= items.length) fail('Индекс выходит за границы. Отсчёт начинается с нуля.');
          return seq.type === 'str' ? val('str',items[idx]) : items[idx];
        }
        if (node.kind === 'unary') {
          const a = evaluate(node.right);
          if (node.op === 'not') return val('bool',!truth(a));
          if (!numeric(a)) fail('Унарный плюс и минус применяются к числам.');
          return number(a.type === 'float' ? 'float' : 'int',(node.op === '-' ? -1 : 1) * Number(a.value));
        }
        if (node.kind === 'binary') {
          const a = evaluate(node.left);
          if (node.op === 'and') return truth(a) ? evaluate(node.right) : a;
          if (node.op === 'or') return truth(a) ? a : evaluate(node.right);
          return arithmetic(node.op,a,evaluate(node.right));
        }
        if (node.kind === 'compare') {
          let a = evaluate(node.values[0]);
          for (let i = 0; i < node.ops.length; i++) {
            const b = evaluate(node.values[i+1]); const op = node.ops[i]; let ok;
            if (op === '==') ok = equal(a,b);
            else if (op === '!=') ok = !equal(a,b);
            else {
              if (!(numeric(a) && numeric(b)) && !(a.type === 'str' && b.type === 'str')) fail('Эти типы нельзя сравнить по величине.');
              const x = numeric(a) ? Number(a.value) : a.value, y = numeric(b) ? Number(b.value) : b.value;
              ok = op === '<' ? x < y : op === '>' ? x > y : op === '<=' ? x <= y : x >= y;
            }
            if (!ok) return val('bool',false);
            a = b;
          }
          return val('bool',true);
        }
        fail('Не удалось разобрать выражение.');
      }
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith('#')) continue;
        try {
          const statement = parse(tokenize(line));
          const value = evaluate(statement.expression);
          if (statement.kind === 'assign') env[statement.name] = value;
        } catch (error) { fail(`Строка ${i + 1}: ${error.message}`); }
      }
      return {ok:true,output:output.join('\n'),env,inputsUsed:inputAt};
    } catch (error) { return {ok:false,output:'',error:error.message}; }
  }
  const api = {run,display};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PySandbox = api;
})(globalThis);
