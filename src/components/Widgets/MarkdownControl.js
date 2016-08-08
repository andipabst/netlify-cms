import React, { PropTypes } from 'react';
import _ from 'lodash';
import { Editor, Plain } from 'slate';
import position from 'selection-position';
import Markdown from 'slate-markdown-serializer';
import { DEFAULT_NODE, NODES, MARKS } from './MarkdownControlElements/localRenderers';
import StylesMenu from './MarkdownControlElements/StylesMenu';
import BlockTypesMenu from './MarkdownControlElements/BlockTypesMenu';
import styles from './MarkdownControl.css';

/**
 * Slate Render Configuration
 */
class MarkdownControl extends React.Component {
  constructor(props) {
    super(props);

    this.customMarkdownSerialize = this.customMarkdownSerialize.bind(this);
    this.markdown = new Markdown({ rules: [{ serialize: this.customMarkdownSerialize }] });

    this.customImageNodeRenderer = this.customImageNodeRenderer.bind(this);
    NODES['image'] = this.customImageNodeRenderer;

    this.blockEdit = false;
    this.menuPositions = {
      stylesMenu: {
        top: 0,
        left: 0,
        width: 0,
        height: 0
      },
      blockTypesMenu: {
        top: 0,
        left: 0,
        width: 0,
        height: 0
      }
    };

    this.state = {
      state: props.value ? this.markdown.deserialize(props.value) : Plain.deserialize('')
    };

    this.handleChange = this.handleChange.bind(this);
    this.handleDocumentChange = this.handleDocumentChange.bind(this);
    this.handleMarkStyleClick = this.handleMarkStyleClick.bind(this);
    this.handleBlockStyleClick = this.handleBlockStyleClick.bind(this);
    this.handleInlineClick = this.handleInlineClick.bind(this);
    this.handleBlockTypeClick = this.handleBlockTypeClick.bind(this);
    this.handleImageClick = this.handleImageClick.bind(this);
    this.focusAndAddParagraph = this.focusAndAddParagraph.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.calculateHoverMenuPosition = _.throttle(this.calculateHoverMenuPosition.bind(this), 100);
    this.calculateBlockMenuPosition = _.throttle(this.calculateBlockMenuPosition.bind(this), 100);
    this.renderBlockTypesMenu = this.renderBlockTypesMenu.bind(this);
    this.renderNode = this.renderNode.bind(this);
    this.renderMark = this.renderMark.bind(this);
  }


  /**
   * The two custom methods customMarkdownSerialize and customImageNodeRenderer make sure that
   * both Markdown serializer and Node renderers have access to getMedia with the latest state.
   */
  customMarkdownSerialize(obj, children) {
    if (obj.kind === 'block' && obj.type === 'image') {
      const src = this.props.getMedia(obj.getIn(['data', 'src']));
      const alt = obj.getIn(['data', 'alt']) || '';
      return `![${alt}](${src})`;
    }
  }
  customImageNodeRenderer(editorProps) {
    const { node, state } = editorProps;
    const isFocused = state.selection.hasEdgeIn(node);
    const className = isFocused ? styles.active : null;
    const src = node.data.get('src');
    return (
      <img {...editorProps.attributes} src={this.props.getMedia(src)} className={className} />
    );
  }

  /**
   * Slate keeps track of selections, scroll position etc.
   * So, onChange gets dispatched on every interaction (click, arrows, everything...)
   * It also have an onDocumentChange, that get's dispached only when the actual
   * content changes
   */
  handleChange(state) {
    if (this.blockEdit) {
      this.blockEdit = false;
    } else {
      this.calculateHoverMenuPosition();
      this.setState({ state }, this.calculateBlockMenuPosition);
    }
  }

  handleDocumentChange(document, state) {
    this.props.onChange(this.markdown.serialize(state));
  }

  calculateHoverMenuPosition() {
    const rect = position();
    this.menuPositions.stylesMenu = {
      top: rect.top + window.scrollY,
      left: rect.left + window.scrollX,
      width: rect.width,
      height: rect.height
    };
  }

  calculateBlockMenuPosition() {
    // Don't bother calculating position if block is not empty
    if (this.state.state.blocks.get(0).isEmpty) {
      const blockElement = document.querySelectorAll(`[data-key='${this.state.state.selection.focusKey}']`);
      if (blockElement.length > 0) {
        const rect = blockElement[0].getBoundingClientRect();
        this.menuPositions.blockTypesMenu = {
          top: rect.top + window.scrollY,
          left: rect.left + window.scrollX
        };
        // Force re-render so the menu is positioned on these new coordinates
        this.forceUpdate();
      }
    }
  }

  /**
   * Toggle marks / blocks when button is clicked
   */
  handleMarkStyleClick(type) {
    let { state } = this.state;

    state = state
      .transform()
      .toggleMark(type)
      .apply();

    this.setState({ state });
  }

  handleBlockStyleClick(type, isActive, isList) {
    let { state } = this.state;
    let transform = state.transform();
    const { document } = state;

    // Handle everything but list buttons.
    if (type != 'bulleted-list' && type != 'numbered-list') {

      if (isList) {
        transform = transform
          .setBlock(isActive ? DEFAULT_NODE : type)
          .unwrapBlock('bulleted-list')
          .unwrapBlock('numbered-list');
      }

      else {
        transform = transform
          .setBlock(isActive ? DEFAULT_NODE : type);
      }
    }

    // Handle the extra wrapping required for list buttons.
    else {
      const isType = state.blocks.some((block) => {
        return !!document.getClosest(block, parent => parent.type == type);
      });

      if (isList && isType) {
        transform = transform
          .setBlock(DEFAULT_NODE)
          .unwrapBlock('bulleted-list');
      } else if (isList) {
        transform = transform
          .unwrapBlock(type == 'bulleted-list')
          .wrapBlock(type);
      } else {
        transform = transform
          .setBlock('list-item')
          .wrapBlock(type);
      }
    }

    state = transform.apply();
    this.setState({ state });
  }

  /**
 * When clicking a link, if the selection has a link in it, remove the link.
 * Otherwise, add a new link with an href and text.
 *
 * @param {Event} e
 */

  handleInlineClick(type, isActive) {
    let { state } = this.state;

    if (type === 'link') {
      if (!state.isExpanded) return;

      if (isActive) {
        state = state
          .transform()
          .unwrapInline('link')
          .apply();
      }

      else {
        const href = window.prompt('Enter the URL of the link:', 'http://www.');
        state = state
          .transform()
          .wrapInline({
            type: 'link',
            data: { href }
          })
          .collapseToEnd()
          .apply();
      }
    }
    this.setState({ state });
  }


  handleBlockTypeClick(type) {
    let { state } = this.state;

    state = state
    .transform()
    .insertBlock({
      type: type,
      isVoid: true
    })
    .apply();

    this.setState({ state }, this.focusAndAddParagraph);
  }

  handleImageClick(mediaProxy) {
    let { state } = this.state;
    this.props.onAddMedia(mediaProxy);
    state = state
    .transform()
    .insertBlock({
      type: 'image',
      isVoid: true,
      data: { src: mediaProxy.path }
    })
    .apply();

    this.setState({ state }, this.focusAndAddParagraph);
  }

  focusAndAddParagraph() {
    const { state } = this.state;
    const blocks = state.document.getBlocks();
    const last = blocks.last();
    const normalized = state
      .transform()
      .focus()
      .collapseToEndOf(last)
      .splitBlock()
      .setBlock(DEFAULT_NODE)
      .apply({
        snapshot: false
      });
    this.setState({ state:normalized });
  }


  handleKeyDown(evt) {
    if (evt.shiftKey && evt.key === 'Enter') {
      this.blockEdit = true;
      let { state } = this.state;
      state = state
      .transform()
      .insertText('  \n')
      .apply();

      this.setState({ state });
    }
  }

  /**
   * Return renderers for Slate
   */
  renderNode(node) {
    return NODES[node.type];
  }
  renderMark(mark) {
    return MARKS[mark.type];
  }

  renderBlockTypesMenu() {
    const currentBlock = this.state.state.blocks.get(0);
    const isOpen = (currentBlock.isEmpty && currentBlock.type !== 'horizontal-rule');

    return (
      <BlockTypesMenu
          isOpen={isOpen}
          position={this.menuPositions.blockTypesMenu}
          onClickBlock={this.handleBlockTypeClick}
          onClickImage={this.handleImageClick}
      />
    );
  }

  renderStylesMenu() {
    const { state } = this.state;
    const isOpen = !(state.isBlurred || state.isCollapsed);

    return (
      <StylesMenu
          isOpen={isOpen}
          position={this.menuPositions.stylesMenu}
          marks={this.state.state.marks}
          blocks={this.state.state.blocks}
          inlines={this.state.state.inlines}
          onClickMark={this.handleMarkStyleClick}
          onClickInline={this.handleInlineClick}
          onClickBlock={this.handleBlockStyleClick}
      />
    );
  }

  render() {
    return (
      <div>
        {this.renderStylesMenu()}
        {this.renderBlockTypesMenu()}
        <Editor
            placeholder={'Enter some rich text...'}
            state={this.state.state}
            renderNode={this.renderNode}
            renderMark={this.renderMark}
            onChange={this.handleChange}
            onKeyDown={this.handleKeyDown}
            onDocumentChange={this.handleDocumentChange}
        />
      </div>
    );
  }
}

export default MarkdownControl;

MarkdownControl.propTypes = {
  onChange: PropTypes.func.isRequired,
  onAddMedia: PropTypes.func.isRequired,
  getMedia: PropTypes.func.isRequired,
  value: PropTypes.node,
};
