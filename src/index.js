/* eslint-disable no-param-reassign */
const { SHOULD_REMOVE_RPX_PROPERTY_JSX } = require('./constants');

const DEPS_MAP = {
  'rax-children': 'Children',
  'rax-is-valid-element': 'isValidElement',
  'rax-clone-element': 'cloneElement',
};

const REACTDOM_DEPS_MAP = {
  'rax-create-portal': 'createPortal',
  'rax-unmount-component-at-node': 'unmountComponentAtNode',
  'rax-find-dom-node': 'findDOMNode',
};

const COMPONENT_NAME_MAPS = {
  view: 'View',
  text: 'Text',
  icon: 'Icon',
  image: 'Image',
  picture: 'Picture',
  scrollview: 'ScrollView',
  slider: 'Slider',
  textinput: 'TextInput',
  link: 'Link',
  video: 'Video',
  canvas: 'Canvas',
  embed: 'Embed',
  countdown: 'Countdown',
  recyclerview: 'Recyclerview',
  modal: 'Modal',
  portal: 'Portal'
};

const CUSTOM_RAX_COMPONENT = '@alifd/meet-react-component-one';
const helperImportedFrom = 'babel-runtime-jsx-style-transform';
const helperImportedName = 'rpx2vw4style';
const helperLocalName = '__rpx2vw__';

let hasReactDom;
let hasRender;
let hasReact;
let needRpx2vw; // 是否需要rpx2vw
let needFakeShared;
module.exports = function (babel, options) {
  const { types: t } = babel;
  const { aliasMap } = options;
  return {
    visitor: {
      Program: {
        enter(path, state) {
          hasReactDom = false;
          hasRender = false;
          needRpx2vw = false;
          needFakeShared = false;
        },
        exit(path) {
          if (needRpx2vw) {
            const imported = t.identifier(helperImportedName);
            const local = t.identifier(helperLocalName);
            const importDeclaration = t.importDeclaration(
              [t.importSpecifier(local, imported)],
              t.stringLiteral(helperImportedFrom)
            );
            path.unshiftContainer('body', importDeclaration);
          }
          // 增加shared防止以下报错
          if (needFakeShared) {
            const variableDeclaration = t.variableDeclaration('const', [
              t.variableDeclarator(
                t.identifier('shared'),
                t.objectExpression([
                  t.ObjectProperty(
                    t.identifier('Host'),
                    t.objectExpression([
                      t.ObjectProperty(
                        t.identifier('driver'),
                        t.objectExpression([])
                      ),
                    ])
                  ),
                ])
              ),
            ]);
            path.unshiftContainer('body', variableDeclaration);
          }
        },
      },
      ImportDeclaration: {
        enter(path) {
          const { node } = path;
          const importValue = node.source && node.source.value;
          if (importValue === 'rax') {
            node.source.value = 'react';
            // render, shared 渲染器相关特殊处理
            node.specifiers = node.specifiers.filter((s) => {
              if (s && t.isImportSpecifier(s)) {
                if (t.isIdentifier(s.imported, { name: 'render' })) {
                  hasRender = true;
                  return false;
                } else if (t.isIdentifier(s.imported, { name: 'shared' })) {
                  needFakeShared = true;
                  return false;
                }
              }
              return true;
            });
            if (hasRender) {
              insertSpecifierToReactDom(
                t.importSpecifier(
                  t.identifier('render'),
                  t.identifier('render')
                ),
                path,
                t
              );
            }
            node.specifiers.unshift(
              t.importDefaultSpecifier(t.identifier('React'))
            );
          }
          // 处理rax拆开的包
          if (importValue.startsWith('rax-')) {
            // 因为要从react中导入所以首先要判断是否存在import {} from 'rax' | 'react'
            if (!isExistRaxOrReact(path, t)) {
              insertAfterImportDeclaration(
                [t.importDefaultSpecifier(t.identifier('React'))],
                'react',
                path,
                t
              );
            }
            // 处理应当从react导入的包
            if (DEPS_MAP[importValue]) {
              // 判断是否存在import ... from rax || react
              if (node.specifiers && node.specifiers.length > 0) {
                const [importSpecifier] = node.specifiers;
                const { container } = path;
                container.forEach((item) => {
                  if (
                    t.isImportDeclaration(item) &&
                    item.source &&
                    item.source.value &&
                    (item.source.value === 'rax' ||
                      item.source.value === 'react')
                  ) {
                    const { specifiers } = item;

                    // 如果存在在组件使用的变量名就取
                    const add = t.importSpecifier(
                      importSpecifier.local ||
                        t.identifier(DEPS_MAP[importValue]),
                      t.identifier(DEPS_MAP[importValue])
                    );
                    specifiers.push(add);
                  }
                });
              }

              path.remove();
              // 处理应当从react-dom导入的包
            } else if (REACTDOM_DEPS_MAP[importValue]) {
              if (node.specifiers && node.specifiers.length > 0) {
                const [importSpecifier] = node.specifiers;
                // 取到在组件中使用的变量名

                insertSpecifierToReactDom(
                  t.importSpecifier(
                    importSpecifier.local ||
                      t.identifier(REACTDOM_DEPS_MAP[importValue]),
                    t.identifier(REACTDOM_DEPS_MAP[importValue])
                  ),
                  path,
                  t
                );
              }
              // 删除rax的包
              path.remove();
            } else {
              // 添加自定义react组件View,Text等
              let componentName;
              node.specifiers.forEach((s) => {
                if (s && t.isImportDefaultSpecifier(s)) {
                  componentName = s.local && s.local.name;
                }
              });
              const imported = importValue.replace(/rax-/, '');
              if (
                componentName &&
                typeof componentName === 'string' &&
                COMPONENT_NAME_MAPS[imported]
              ) {
                const specifier = t.importSpecifier(
                  t.identifier(componentName),
                  t.identifier(COMPONENT_NAME_MAPS[imported])
                );
                let hasCustomRaxComponent = false;
                const { container } = path;
                container.forEach((item) => {
                  // 如果已经有插入一个替换rax组件的包了
                  if (
                    t.isImportDeclaration(item) &&
                    item.source &&
                    item.source.value &&
                    item.source.value === CUSTOM_RAX_COMPONENT
                  ) {
                    hasCustomRaxComponent = true;
                    const { specifiers } = item;

                    // 如果存在在组件使用的变量名就取
                    specifiers.push(specifier);
                  }
                });
                if (!hasCustomRaxComponent) {
                  insertAfterImportDeclaration(
                    [specifier],
                    CUSTOM_RAX_COMPONENT,
                    path,
                    t
                  );
                }
                path.remove();
              }
            }
          }

          // 将rax封装的包替换成react对应的npm包
          if (aliasMap && aliasMap[importValue]) {
            node.source.value = aliasMap[importValue];
          }
        },
      },
      CallExpression(path) {
        const { node } = path;
        const { callee } = node;

        if (t.isIdentifier(callee, { name: 'findDOMNode' })) {
          if (node.arguments && node.arguments.length > 0) {
            path.replaceWith(node.arguments[0]);
          }
        }

        if (t.isIdentifier(callee, { name: 'render' })) {
          if (
            node.arguments &&
            node.arguments.length > 2 &&
            node.arguments[2] &&
            node.arguments[2].properties &&
            node.arguments[2].properties.length > 0
          ) {
            const props = node.arguments[2].properties;
            if (props.find((p) => t.isIdentifier(p.key, { name: 'driver' }))) {
              node.arguments = node.arguments.slice(0, 2);
            }
          }
        }
      },
      JSXElement(path) {
        const { node } = path;
        const oe = node.openingElement;
        const ce = node.closingElement;

        // style中单位处理
        const attrs = oe.attributes;
        attrs.forEach((attr) => {
          if (t.isJSXAttribute(attr)) {
            if (t.isJSXIdentifier(attr.name) && attr.name.name === 'style') {
              const ep = attr.value.expression;
              if (ep) {
                needRpx2vw = true;
                attr.value.expression = t.callExpression(
                  t.identifier('__rpx2vw__'),
                  [ep]
                );
              }
            }
          }
        });
      },
    },
  };
};

function insertSpecifierToReact(specifier, path, t) {
  const { container } = path;
  container.forEach((item) => {
    if (
      item &&
      t.isImportDeclaration(item) &&
      item.source &&
      item.source.value &&
      item.source.value === 'react'
    ) {
      hasReact = true;
      const { specifiers } = item;

      specifiers.push(specifier);
    }
  });
  if (!hasReact) {
    insertAfterImportDeclaration([specifier], 'react', path, t);
    hasReact = true;
  }
}

// 向ReactDom中插入specifier
function insertSpecifierToReactDom(specifier, path, t) {
  const { container } = path;
  container.forEach((item) => {
    if (
      item &&
      t.isImportDeclaration(item) &&
      item.source &&
      item.source.value &&
      item.source.value === 'react-dom'
    ) {
      hasReactDom = true;
      const { specifiers } = item;

      specifiers.push(specifier);
    }
  });
  if (!hasReactDom) {
    insertAfterImportDeclaration([specifier], 'react-dom', path, t);
  }
}

function insertAfterImportDeclaration(specifiers, sourceValue, path, t) {
  path.insertAfter(
    t.importDeclaration(specifiers, t.stringLiteral(sourceValue))
  );
}

function isExistRaxOrReact(path, t) {
  let result = false;
  const { container } = path;
  container.forEach((item) => {
    if (
      t.isImportDeclaration(item) &&
      item.source &&
      item.source.value &&
      (item.source.value === 'rax' || item.source.value === 'react')
    ) {
      result = true;
    }
  });

  return result;
}
