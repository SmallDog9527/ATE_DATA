

#if !defined(__INIREADER)
#define __INIREADER

#define  WIN32_LEAN_AND_MEAN             // Exclude rarely-used stuff from Windows headers

#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include <stdarg.h>
#include <float.h>
#include <math.h>
#include <assert.h>
#include <ctype.h>
#include <limits.h>     // for PATH_MAX

#ifdef WIN32
#  include <windows.h>
#  include <direct.h>
#else // linux / solaris
#  include <unistd.h>   // for getcwd

#  define _vsnprintf vsnprintf
#  define _snprintf  snprintf
#  define _stricmp   strcasecmp
#  define _getcwd    getcwd
#  define _MAX_PATH  PATH_MAX
#endif

#define DEL(p)     if(p){delete [] p; p=NULL;}
#define DEL_OBJ(p) if(p){delete    p; p=NULL;}

/////////////////////////////////////////////////////////////////////////////////
class KEY {
    friend      class SECTION;
    friend      class READER;
public:
    const char  *getName() {return key;};
    const char  *getString();
    bool        getString(char *buf, size_t size);
    bool        getInteger(int *buf);
    bool        getDouble(double *buf);
    bool        getBoolean(bool *buf);
    void        setString(const char *buf);
private:
                KEY(const char *key_name, const char *data, bool isvalid=true);
                ~KEY();   
    KEY         *pre_node;
    KEY         *next_node;
    char        *key;
    char        *value;
    bool        valid;
};

/////////////////////////////////////////////////////////////////////////////////
class SECTION {
    friend      class READER;
public:
    const char  *getName() {return name;};
    unsigned    getKeyCount() {return num_keys;};   // returns # of valid keys
    KEY         *getKey(unsigned index);
    KEY         *getKey(const char *key_name);
    KEY         *getNextKey();
private:
                SECTION(const char *section_name, bool isvalid=true);
                ~SECTION();
    KEY         *find_key(const char *key_name);
    KEY         *add_key (const char *key_name, const char *value, bool isvalid=true);
    KEY         *key_root;
    KEY         *current_key;
    SECTION     *next_node;
    SECTION     *pre_node;
    char        *name;
    unsigned    num_keys;
    bool        valid;
};

/////////////////////////////////////////////////////////////////////////////////
class READER {
public:
                READER(const char *options=NULL); // comma separated list of options
                ~READER();
    bool        open(const char *file);   // open 'file' and read it into memory. If 'file' doesn't contain ':' character the current working directory is prepended to 'file'
    bool        append(const char *file); // append content from 'file' to memory. If 'file' doesn't contain ':' character the current working directory is prepended to 'file'
    bool        dump(const char *file);   // if 'file' doesn't contain ':' character the current working directory is prepended to 'file'
    unsigned    getSectionCount() {return num_sections;}; // returns # of valid sections
    unsigned    getMaxStringLength() {return max_string_length;};
    const char  *getString(const char *section_name, const char *key_name);
    bool        getString (const char *section_name, const char *key_name, char *value, size_t size);
    bool        getInteger(const char *section_name, const char *key_name, int *value);
    bool        getDouble (const char *section_name, const char *key_name, double *value);
    bool        getBoolean(const char *section_name, const char *key_name, bool *value);
    SECTION     *getSection(unsigned index);
    SECTION     *getSection(const char *section_name);
    SECTION     *getNextSection();
    static bool isCaseSensitive() {return case_sensitive;}; // true if section and key match is case-sensitive
private:
    void        process(char **source);
    SECTION     *find_section(const char *section_name);
    SECTION     *add_section (const char *section_name, bool isvalid=true);
    SECTION     *section_root;
    SECTION     *current_section;
    unsigned    num_sections;
    unsigned    max_string_length;
    bool        multiline_support;
    static bool case_sensitive;
};

/////////////////////////////////////////////////////////////////////////////////
// Based on http://www.speqmath.com/tutorials/expression_parser_cpp/index.html //
/////////////////////////////////////////////////////////////////////////////////
#define MAX_TOKEN_LENGTH 200    // defines the maximum # of characters per token
#define MAX_ERROR_BUFFER 300    // defines size of the error message buffer
#define MAX_LOOKUP_DEPTH  10    // defines the maximum lookup depth for variables
                                // be aware that increasing this bears the risk 
                                // of stack overflows!
#define UNIT_BUFFER_SIZE  10    // defines the size for the unit string

/////////////////////////////////////////////////////////////////////////////////
class PARSERERROR {
public:
                PARSERERROR(const char *id, ...);
    const char  *get_msg() {return msg;}                      // returns a pointer to the error msg
    const char  *get_msg(const int id) {return msgdesc(id);}  // returns a pointer to the error msg
private:
    int         err_id;                     // id of the error
    char        msg[MAX_ERROR_BUFFER];
    const char  *msgdesc(const int id);
};

/////////////////////////////////////////////////////////////////////////////////
class PARSER {
public:
                PARSER();
                ~PARSER();
    const char  *parse(const char *expression, double* result);
    const char  *parse(const char *expression, double* result, READER *reader, 
                       const char* search_first, const char* search_second=NULL);
    bool        getBaseUnit(char* baseUnit);
private:
    enum        TOKENTYPE {NOTHING = -1, DELIMETER, NUMBER, HEXNUMBER, BOOLNUMBER, 
                           BINARYNUMBER, VARIABLE, UNITFACTOR, UNKNOWN};
    enum        OPERATOR_ID {AND, OR, BITSHIFTLEFT, BITSHIFTRIGHT,  // level 1
                             PLUS, MINUS,                           // level 2
                             MULTIPLY, DIVIDE, XOR,                 // level 3
                             NOT};                                  // level 4

    static      unsigned lookup_cnt;        // hold the # of recursive lookups
    char        *expr;                      // holds the expression
    char        *ex;                        // points to a character in expr 
    char        token[MAX_TOKEN_LENGTH+1];  // holds the token
    TOKENTYPE   token_type;                 // type of the token
    char        err_str[MAX_ERROR_BUFFER];
    char        unit_str[UNIT_BUFFER_SIZE];
    bool        unit_found;
    const char  *first;
    const char  *second;
    READER      *r;
    PARSER      *prs;

    const char  *parse(const char *expression, double* result, READER *reader, 
                       const char* search_first, const char* search_second, 
                       bool islookup);
    void        getToken();
    double      parse_level1();             // logical bit and shift operators
    double      parse_level2();             // add or subtract
    double      parse_level3();             // multiply, divide, xor
    double      parse_level4();             // unary minus, plus and logical negation
    double      parse_level5();             // parenthesized expression or value
    double      parse_level6();             // unit factor
    double      parse_number();
    int         get_operator_id(const char *op_name);
    double      eval_operator(const int op_id, const double &lhs, const double &rhs);
    double      eval_variable(const char *var_name);
    double      eval_unit(const char unit, const double &value);
};

#endif // !defined(__INIREADER)
