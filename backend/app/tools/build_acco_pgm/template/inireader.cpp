
#include "stdafx.h"
#include "inireader.h"

static void   strcat_dynamic(char **destination, const char *source);
static void   clean(char **source);
static int    cmpstr(const char *str1, const char *str2);

/////////////////////////////////////////////////////////////////////////////////
// class KEY 
/////////////////////////////////////////////////////////////////////////////////
KEY::KEY(const char *key_name, const char *data, bool isvalid){
    key = new char[strlen(key_name)+1];
    value = new char[strlen(data)+1];
    strcpy_s(key, strlen(key_name)+1, key_name);
    strcpy_s(value, strlen(data)+1, data);
    valid = isvalid;
    this->next_node = NULL;
}

KEY::~KEY(){
    DEL(key);
    DEL(value);
}

bool KEY::getBoolean(bool* buf){
    
    if(!valid) 
        return false;

    char *temp = new char[strlen(value)+1]; 
    bool calc = false;

    strcpy_s(temp, strlen(value)+1, value);

    if(_stricmp(temp, "true") == 0)
        calc = true;
    else if(_stricmp(temp, "false") == 0)
        calc = false;
    else {
        DEL(temp);
        return false; // not found
    }

    DEL(temp);

    if(buf){
        *buf =  calc;
        return true;
    }
    return false;
} /* KEY::getBoolean */

bool KEY::getDouble(double* buf){

    if(!valid) 
        return false;

    char    *temp = new char[strlen(value)+1]; 
    char    *p;
    int     num_read,cread;
    double  double_value;
    bool    ok=false;
    
    strcpy_s(temp, strlen(value)+1, value);
    
    p = temp;
    num_read=sscanf_s(p,"%lf%n", &double_value, &cread);
    if(num_read>0){
        p+=cread;
        while(*p!='\0' && isspace(*p) ) p++;    // step forward to next character
        switch(*p){    
            case 'M': double_value *= 1e6;   break;
            case 'k': double_value *= 1e3;   break;
            case '%': double_value *= 1e-2;  break;
            case 'm': double_value *= 1e-3;  break;
            case 'u': double_value *= 1e-6;  break;
            case 'n': double_value *= 1e-9;  break;
            case 'p': double_value *= 1e-12; break;
        }
        ok=true;
    } else {
        double_value = 0.0;
        ok=false;
    }

    DEL(temp);

    if(buf)
        *buf =  double_value;

    return ok;

} /* KEY::getDouble */

bool KEY::getInteger(int* buf){
    
    if(!valid)
        return false;

    char     *temp = new char[strlen(value)+1];
    char     *p;
    unsigned calc=0;
    int      num_read=0;
    bool     ok=false;
    
    strcpy_s(temp, strlen(value)+1, value);

    // convert boolean
    if(_stricmp(temp, "true") == 0){
        calc=1;
        num_read=1;
    }
    else if(_stricmp(temp, "false") == 0){
        calc=0;
        num_read=1;
    }
    // convert hex
    else if(strrchr(temp, 'x')){ 
        num_read=sscanf_s(temp, "0x%x", &calc);
    }
    // convert binary
    else if(*temp == 'b'){ 
        for (p=temp+1;p < temp + strlen(temp)-1; p++){
            calc += (*p == '1') ? 1 : 0;
            
            if(*p == '1' || *p == '0'){
                num_read++;
                calc <<= 1;
            } else { // error handler
                calc = 0;
                num_read = 0;
                break;
            }
        }
        calc += (*p == '1') ? 1 : 0;
        if(*p == '1' || *p == '0') 
            num_read++;
        else { 
            calc = 0;
            num_read = 0;
        }
    }
    // convert integer
    else 
        num_read=sscanf_s(temp, "%d", &calc);    

    DEL(temp);

    if(num_read>0){
        ok = true;
    } else {
        calc = 0;
    }

    if(buf)
        *buf = calc;

    return ok;
} /* KEY::getInteger */

const char *KEY::getString(){
    return value;
} /* KEY::getString */

bool KEY::getString(char* buf, size_t size){
    if(buf && size > 0){
        strncpy_s(buf,size,value,size);
        buf[size-1] = '\0';
    }
    return valid;
} /* KEY::getString */

void KEY::setString(const char *buf){
    DEL(value);
    value = new char[strlen(buf)+1];
    strcpy_s(value, strlen(buf)+1, buf);
} /* KEY::setString */

/////////////////////////////////////////////////////////////////////////////////
// class SECTION
/////////////////////////////////////////////////////////////////////////////////
SECTION::SECTION(const char *section_name, bool isvalid){
    name = new char[strlen(section_name)+1];
    strcpy_s(name, strlen(section_name)+1, section_name);
    num_keys = 0;
    next_node  = NULL;
    key_root = NULL;
    current_key = NULL;
    valid = isvalid;
}

SECTION::~SECTION(){
    KEY *k = key_root;
    if(key_root){
        while(k->next_node)
            k = k->next_node;
        while(k != key_root){
            k = k->pre_node;
            DEL_OBJ(k->next_node);
        }
        DEL_OBJ(key_root);
        num_keys = 0;
    }
    DEL(name);
}

KEY *SECTION::add_key(const char *key_name, const char *value, bool isvalid){
    KEY *k = key_root;
    if(key_root) {
        while(k->next_node)
            k = k->next_node;

        k->next_node  = new KEY(key_name,value,isvalid);
        k->next_node->pre_node = k;
        k = k->next_node;
    } else {
        key_root = new KEY(key_name,value,isvalid);
        key_root->pre_node = NULL;
        k = key_root;
    }
    if(isvalid)
        num_keys++;
    return k;
}

KEY *SECTION::find_key(const char *key_name){
    KEY *k = key_root;
    if(strcmp(key_name,"") != 0 && key_root){
        do{
            if(cmpstr(k->key, key_name) == 0){
                return k;
            } else {
                if(k->next_node) 
                    k = k->next_node;
            }
        }while(k->next_node);

        if(cmpstr(k->key, key_name) == 0){
            return k;
        } else {
            return add_key(key_name,"",false); // mark key invalid
        }
    } else {
        return add_key(key_name,"",false); // mark key invalid
    }
}

KEY *SECTION::getKey(unsigned index){
    KEY *k = NULL;
    if(key_root){
        k = key_root;
        for(unsigned i=0;i<index;i++)
            k = k->next_node;

        while(!k->valid){
            k = k->next_node;
            if(!k)
                break;
        }
    }
    return k;
}

KEY *SECTION::getKey(const char *key_name){
    KEY *k = find_key(key_name);
    return k->valid ? k : NULL;
}

KEY *SECTION::getNextKey(){
    if(!current_key)
        key_root ? current_key=key_root : current_key=NULL; // start with key_root
    else {
        do {
            current_key = current_key->next_node;
            if(!current_key)
                break;
        } while(!current_key->valid);
    }
    return current_key;
}

/////////////////////////////////////////////////////////////////////////////////
// class READER 
/////////////////////////////////////////////////////////////////////////////////
bool READER::case_sensitive=false;

READER::READER(const char *options){
    current_section = NULL;
    section_root = NULL;
    num_sections = 0;
    max_string_length = 0;
    multiline_support = options ? (strstr(options,"MULTILINE")   ? true : false) : false;
    case_sensitive = options ? (strstr(options,"CASE_SENSITIVE") ? true : false) : false;
}

READER::~READER(){
    if(section_root){ 
        SECTION *s = section_root;
        while(s->next_node)
            s = s->next_node;
        while(s != section_root){
            s = s->pre_node;
            DEL_OBJ(s->next_node);
        }
        DEL_OBJ(section_root);
        num_sections = 0;
    }
    current_section = NULL;
}

bool READER::open(const char *file){

    this->~READER();                // clean up memory

    return append(file);
} /* READER::open */

bool READER::append(const char *file){
    FILE *fp = NULL;
    char filepath[_MAX_PATH]="";    // defined in <stdlib.h>
#ifndef DLL_MODE
    if(!strchr(file,':')){          // prepend current working directory if only file name is passed
        _getcwd(filepath,_MAX_PATH);
        strcat_s(filepath,_MAX_PATH,"/");       // using '/' as directory separator for windows/unix portability
    }
#endif
    strcat_s(filepath,_MAX_PATH,file);
	fopen_s(&fp, filepath, "r");
    if(fp == NULL)
        return false;

    char read[200]="";
    char *line=NULL;
    char *buffer=NULL;

    while(1){ // endless loop (break on EOF)
        while(!strchr(read,'\n')){  // read full line
            if(!fgets(read, sizeof(read), fp))
                break;
            strcat_dynamic(&line, read);
        };
        strcpy_s(read,sizeof(read) / sizeof(char),""); // clear read buffer 
        if(line!=NULL){
            clean(&line);
            if((!strchr(line,'=') && !strchr(line,'[')) && multiline_support){  // check for '=' or '[' character
                unsigned length=strlen(line);
                if(length>0 && line[length-1]!=',' && multiline_support)        // check if last character is , (comma)
                    strcat_dynamic(&line, ",");                                 // if not add it to line
                strcat_dynamic(&buffer, line);
                DEL(line);
            } else {
                process(&buffer);
                unsigned length=strlen(line);
                if(length>0 && line[length-1]!=',' && line[length-1]!='=' && multiline_support)
                    strcat_dynamic(&line, ",");
                strcat_dynamic(&buffer, line);
                DEL(line);
            }
        }
        if(feof(fp)){ // EOF reached?
            process(&buffer);
            break;    // exit endless loop
        }
    };

    DEL(buffer); // destroy buffer
    current_section=NULL;
    
    fclose(fp);

    return true;
} /* READER::append */

bool READER::dump(const char *file){ 
    FILE *fp = NULL;
    char filepath[_MAX_PATH];       // defined in <stdlib.h>
#ifndef DLL_MODE
    if(!strchr(file,':')){          // prepend current working directory if only file name is passed
        _getcwd(filepath,_MAX_PATH);
        strcat_s(filepath,_MAX_PATH,"/");       // using '/' as directory separator for windows/unix portability
    }
#endif
    strcat_s(filepath,_MAX_PATH,file);
	fopen_s(&fp, filepath, "w");
    if(fp == NULL)
        return false;
    
    const char *value = NULL;
    SECTION *s = NULL;
    KEY *k = NULL;

    while((s=getNextSection())){
        fprintf(fp,"[%s]\n",s->getName());
        while((k=s->getNextKey())){
            value = k->getString();
            if(value)
                fprintf(fp,"%s=%s\n",k->getName(),value);
        }
    }
    fclose(fp);
    return true;
} /* READER::dump */

void READER::process(char **source){
    if((*source!=NULL) && strlen(*source)){
        unsigned i = 0;
        const char *p = *source;
        char *temp = new char[strlen(*source)+1];
        strcpy_s(temp,sizeof(temp) / sizeof(char),"");
        char *value; 
        char *key;

        switch(*p){
            case '[': // get section name
                p++;
                while((*p != ']')&&(i<=strlen(*source))){
                    temp[i]=*p;
                    p++; i++;
                }
                temp[i]='\0';
                current_section = add_section(temp);                // dynamically create new section
                break;
            default: // get key=value pairs
					char *next_token=NULL;
                    key = strtok_s(*source, "=", &next_token);
                    value = strtok_s(NULL,  " ", &next_token);
                    if(key){
                        if(value){
                            if(value[strlen(value)-1]==',' && multiline_support) // remove comma @ end of line
                                value[strlen(value)-1]='\0';
                            current_section->add_key(key,value);    // dynamically create new key/value pair
                            if(strlen(value)>max_string_length)
                                max_string_length = strlen(value);  // save size of longest string
                        } else {
                            if(current_section)
                                current_section->add_key(key,"");   // add only key with empty value
                        }
                    }
                break;
        }
        DEL(temp);
        strcpy_s(*source,sizeof(*source) / sizeof(char),"");
    }
} /* READER::process */

SECTION *READER::find_section(const char *section_name){
    SECTION *s = section_root;
    if(strcmp(section_name,"") != 0 && section_root){
        do{
            if(cmpstr(s->name, section_name) == 0){
                return s;
            }else{
                if(s->next_node) 
                    s = s->next_node;
            }
        }while(s->next_node);

        if(cmpstr(s->name, section_name) == 0){
            return s;
        } else {
            return add_section(section_name,false);
        }
    } else {
        return add_section(section_name,false);
    }
} /* READER::find_section */

SECTION *READER::add_section(const char *section_name, bool isvalid){
    SECTION *s = section_root;
    if(section_root){
        while(s->next_node)
            s = s->next_node;
        s->next_node = new SECTION(section_name,isvalid);
        s->next_node->pre_node = s;
        s = s->next_node;
    } else {
        section_root = new SECTION(section_name,isvalid);
        section_root->pre_node = NULL;
        s = section_root;
    }
    if(isvalid)
        num_sections++;
    return s;
} /* READER::add_section */

SECTION *READER::getSection(unsigned index){
    SECTION *s = NULL;
    if(section_root){
        s  = section_root;
        for(unsigned i=0;i<index;i++)
            s = s->next_node;

        while(!s->valid){
            s = s->next_node;
            if(!s)
                break;
        }
    }
    return s;
} /* READER::getSection */

SECTION *READER::getSection(const char *section_name){
    SECTION *s = find_section(section_name);
    return s->valid ? s : NULL;
} /* READER::getSection */

SECTION *READER::getNextSection(){
    if(!current_section)
        section_root ? current_section=section_root : current_section=NULL; // start with section_root
    else {
        do {
            current_section = current_section->next_node;
            if(!current_section)
                break;
        } while(!current_section->valid);
    }
    return current_section;
} /* READER::getNextSection */

const char *READER::getString(const char *section_name, const char *key_name){
    SECTION *s = find_section(section_name);
    KEY *k = s->find_key(key_name);
    return k->getString();
} /* READER::getString */

bool READER::getString(const char *section_name, const char *key_name, char* value, size_t size){
    SECTION *s = find_section(section_name);
    KEY *k = s->find_key(key_name);
    if(value && size > 0){
        strncpy_s(value,size,k->getString(),size);
        value[size-1] = '\0'; 
    }
    return k->valid;
} /* READER::getString */

bool READER::getInteger(const char *section_name, const char *key_name, int* value){
    SECTION *s = find_section(section_name);
    KEY *k = s->find_key(key_name);
    return k->getInteger(value);
} /* READER::getInteger */

bool READER::getDouble(const char *section_name, const char *key_name, double* value){
    SECTION *s = find_section(section_name);
    KEY *k = s->find_key(key_name);
    return k->getDouble(value);
} /* READER::getDouble */

bool READER::getBoolean(const char *section_name, const char *key_name, bool* value){
    SECTION *s = find_section(section_name);
    KEY *k = s->find_key(key_name);
    return k->getBoolean(value);
} /* READER::getBoolean */

/////////////////////////////////////////////////////////////////////////////////
static void strcat_dynamic(char **destination, const char *source){
    //if(source){
    //    unsigned size_s = strlen(source);
    //    if(*destination!=NULL){
    //        // backup old *destination content into temp
    //        unsigned size_d = strlen(*destination);
    //        char *temp = new char[size_d+1];
    //        strcpy(temp,*destination); 
    //        delete [] *destination;
    //        *destination = new char[size_s+size_d+1];
    //        strcpy(*destination,temp);
    //        strcat(*destination,source); // append source to destination
    //        DEL(temp);
    //    } else {
    //        *destination = new char[size_s+1];
    //        strcpy(*destination,source);
    //    }
    //}
    if(source){
        unsigned size_s = strlen(source);
        if(*destination!=NULL){
            // backup old *destination content into temp
            unsigned size_d = strlen(*destination);
            char *temp = new char[size_d+1];
            strcpy_s(temp,size_d+1,*destination); 
            delete [] *destination;
            *destination = new char[size_s+size_d+1];
            strcpy_s(*destination,size_s+size_d+1,temp);
            strcat_s(*destination,size_s+size_d+1,source); // append source to destination
            DEL(temp);
        } else {
            *destination = new char[size_s+1];
            strcpy_s(*destination,size_s+1,source);
        }
    }
} /* strcat_dynamic */

/////////////////////////////////////////////////////////////////////////////////
static void clean(char **source){
	size_t len = strlen(*source) + 1;
    if((*source!=NULL) && strlen(*source)){
        char *destination = new char[strlen(*source)+1];
        char *d = destination;
        for(const char *p = *source; p < *source + strlen(*source)+1; p++){
            switch(*p){
                case ' ':
                case '\t':
                case '\n':
                case '\r':
                    break;
                case ';':  // ingore comments 
                    *d = '\0';
                    p=*source+strlen(*source); // set p to end of string
                    break;
                default: 
                    *d = *p;
                    d++;               
                    break;
            }
        }
        strcpy_s(*source,len,destination);
        DEL(destination);
    }
} /* clean */

/////////////////////////////////////////////////////////////////////////////////
static int cmpstr(const char *str1, const char *str2){
    if(READER::isCaseSensitive())
        return  strcmp(str1,str2);
    else
        return _stricmp(str1,str2); 
} /* cmpstr */


/////////////////////////////////////////////////////////////////////////////////
// Based on http://www.speqmath.com/tutorials/expression_parser_cpp/index.html //
/////////////////////////////////////////////////////////////////////////////////
unsigned PARSER::lookup_cnt = 0;

PARSERERROR::PARSERERROR(const char *id, ...){ 
    err_id=atoi(id);
    const char *msg_desc = msgdesc(err_id);
    va_list marker;
    va_start(marker, id);
    _vsnprintf_s(msg,sizeof(msg),msg_desc,marker);
    va_end(marker);
}

const char *PARSERERROR::msgdesc(const int id){
    switch (id){
        // syntax errors
        case 1:   return "Syntax error in part '%s'";
        case 2:   return "Syntax error";
        case 3:   return "Parentesis ')' missing";
        case 4:   return "Empty expression";
        case 5:   return "Unexpected part '%s'";
        case 6:   return "Unexpected end of expression";
        case 7:   return "Value expected";
        // data types
        case 50:  return "Maximum 32 bits supported";
        case 51:  return "Hex number invalid";
        // wrong or unknown operators, functions, variables
        case 101: return "Unknown operator '%s'";
        case 104: return "Unknown variable '%s'";
        // too many recursive lookups
        case 110: return "Too many recursive lookups '%s' (max. %i allowed)";
    }
    return "Unknown error";
} /* PARSERERROR::msgdesc */

PARSER::PARSER(){
    ex = NULL;
    prs = NULL;
    expr = NULL;
    token[0] = '\0';
    token_type = NOTHING;
}

PARSER::~PARSER(){
    DEL_OBJ(prs);
}

// parses and evaluates the given expression and fills result with value
// on error a description is returned
const char *PARSER::parse(const char *expression, double *result){
    const char *err=NULL; char *temp=NULL;
    strcat_dynamic(&temp,expression);
    clean(&temp);
    err=parse(temp,result,NULL,NULL,NULL,false);
    DEL(temp);
    return err;
} /* PARSER::parse */

// parses and evaluates the given expression and fills result with value
// on error a description is returned
const char *PARSER::parse(const char *expression, double *result, READER *reader, 
                          const char *search_first, const char *search_second){
    const char *err=NULL;
    err=parse(expression,result,reader,search_first,search_second,false);
    return err;
} /* PARSER::parse */

// parses and evaluates the given expression and fills result with value
// on error a description is returned
const char *PARSER::parse(const char *expression, double *result, READER *reader, 
                          const char *search_first, const char *search_second, bool islookup){
    double ans=0;
    strcpy_s(err_str,sizeof(err_str) / sizeof(char),"");
    strcpy_s(unit_str,sizeof(unit_str) / sizeof(char),"");
    unit_found=false;
    
    if(islookup){ // check if we were called recursively and limit it to MAX_LOOKUP_DEPTH
        PARSER::lookup_cnt++;
        if(PARSER::lookup_cnt>MAX_LOOKUP_DEPTH){
            throw PARSERERROR("110", token, MAX_LOOKUP_DEPTH);
        }
    } else
        PARSER::lookup_cnt=0;
    
    try {
        r=reader;
        first=search_first;
        second=search_second;
        
        // check for undefined expression
        if(!expression){
            throw PARSERERROR("4");
        }

        strcat_dynamic(&expr,expression);
        ex = expr;                   // let ex point to the start of the expression
        ans = 0;

        getToken();
        if(token_type == DELIMETER && *token == '\0'){
            throw PARSERERROR("4");
        }
        ans = parse_level1();
        // check for garbage at the end of the expression 
        // an expression ends with a character '\0' and token_type = delimeter
        if(token_type != DELIMETER || *token != '\0'){
            if(token_type == DELIMETER){
                // user entered a not existing operator like "//"
                throw PARSERERROR("101", token);
            } else {
                throw PARSERERROR("5", token);
            }
        }

        if(result)
            *result=ans;

    } catch (PARSERERROR err){
        _snprintf_s(err_str, sizeof(err_str), "Error: %s", err.get_msg());
    }

    DEL(expr);

    return err_str;
} /* PARSER::parse */

bool PARSER::getBaseUnit(char* baseUnit){
    if(unit_found){
        strncpy_s(baseUnit,sizeof(baseUnit),unit_str,sizeof(unit_str));
        baseUnit[sizeof(baseUnit) - 1] = '\0';
        return true;
    } else {
        strcpy_s(baseUnit,strlen(baseUnit) + 1,"");
        return false;
    }
} /* PARSER::getBaseUnit */

// checks if the given char c is a delimeter; minus and plus is checked apart 
// as they can be unary minus or plus
static bool isDelimeter(const char c){
    if(c == 0) return 0;
    return strchr("&|<>=/*^", c) != 0;
} /* isDelimeter */

// checks if the given char c is a letter or underscore
static bool isAlpha(const char c){
    if(c == 0) return 0;
    return strchr("ABCDEFGHIJKLMNOPQRSTUVWXYZ_", toupper(c)) != 0;
} /* isAlpha */

// checks if the given char c is a digit or dot
static bool isDigitDot(const char c){
    if(c == 0) return 0;
    return strchr("0123456789.", c) != 0;
} /* isDigitDot */

// checks if the given char c is a digit
static bool isDigit(const char c){
    if(c == 0) return 0;
    return strchr("0123456789", c) != 0;
} /* isDigit */

// checks if the given char c belongs to a hex number
static bool isHexChar(const char c){
    if(c == 0) return 0;
    return strchr("0123456789ABCDEF", toupper(c)) != 0;
} /* isHexChar */

// checks if the given char c is a digit
static bool isBinary(const char c){
    if(c == 0) return 0;
    return strchr("01", c) != 0;
} /* isBinary */

// checks if the given char c is a unit factor
static bool isUnitFactor(const char c){
    if(c == 0) return 0;
    return strchr("Mkmunp%", c) != 0;
} /* isUnitFactor */

// checks if the given string is a unit
static bool isUnit(const char *str){
    if(!str) return false;
    if(!_stricmp(str, "V"))     {return true;}
    if(!_stricmp(str, "A"))     {return true;}
    if(!_stricmp(str, "Ohm"))   {return true;}
    if(!_stricmp(str, "s"))     {return true;}
    if(!_stricmp(str, "Hz"))    {return true;}
    if(!_stricmp(str, "H"))     {return true;}
    if(!_stricmp(str, "F"))     {return true;}
    if(!_stricmp(str, "W"))     {return true;}
    if(!_stricmp(str, "C"))     {return true;}
    if(!_stricmp(str, "DGR"))   {return true;}
    return false;
} /* isUnit */

// get next token in the current string expr.
void PARSER::getToken(){
    token_type = NOTHING;
    char *t;                        // points to a character in token
    t = token;                      // let t point to the first character in token
    *t = '\0';                      // set token empty

    if(*ex == '\0'){                // check for end of expression
        token_type = DELIMETER;
        return;
    }

    if(*ex == '-'){                 // check for minus
        token_type = DELIMETER;
        *t = *ex;
        ex++; t++;
        *t = '\0';
        return;
    }

    if(*ex == '+'){                 // check for plus
        token_type = DELIMETER;
        *t = *ex;
        ex++; t++;
        *t = '\0';
        return;
    }

    if(*ex == '!'){                 // check for logical negation
        token_type = DELIMETER;
        *t = *ex;
        ex++; t++;
        *t = '\0';
        return;
    }

    if(*ex == '(' || *ex == ')'){   // check for parentheses
        token_type = DELIMETER;
        *t = *ex;
        ex++; t++;
        *t = '\0';
        return;
    }

    if(isDelimeter(*ex)){           // check for operators (delimeters)
        token_type = DELIMETER;
        while (isDelimeter(*ex)){
            *t = *ex;
            ex++; t++;
        }
        *t = '\0';
        return;
    }
    
    if(tolower(*ex) == 'b'){   // check for binary notation like "b0100011"
        char* ex2 = NULL;
        ex2 = ex; // backup ex
        *t = *ex;
        ex++; t++;
        while (isBinary(*ex)){
            *t = *ex;
            ex++; t++;
        }
        *t = '\0';
        if(strlen(token)>1){
            token_type = BINARYNUMBER;
            return;
        } else {
            ex = ex2;
            t--;
            *t = *ex;
        }
    }

    if(isDigitDot(*ex)){            // check for a value
        token_type = NUMBER;
        if(*ex=='0'){                
            while(isDigitDot(*ex)){ // check for hex notation like "0x28" or "0xAA"
                *t = *ex;
                ex++; t++;
            }
            if(tolower(*ex) == 'x'){
                token_type = HEXNUMBER;
                *ex = tolower(*ex); // convert X to lower case
                *t = *ex;
                ex++; t++;
                if(*ex == '+' || *ex == '-'){
                    *t = *ex;
                    ex++; t++;
                }
                while(isHexChar(*ex)){
                    *t = *ex;
                    ex++; t++;
                }
            }
            *t = '\0';

        } else {
            token_type = NUMBER;
            while(isDigitDot(*ex)){
                *t = *ex;
                ex++; t++;
            }
            if(toupper(*ex) == 'E'){    // check for scientific notation like "2.3e-4" or "1.23e50"
                *t = *ex;
                ex++; t++;
                if(*ex == '+' || *ex == '-'){
                    *t = *ex;
                    ex++; t++;
                }
                while (isDigit(*ex)){
                    *t = *ex;
                    ex++; t++;
                }
            }
            *t = '\0';
        }
        return;
    }

    if(isAlpha(*ex) || isUnitFactor(*ex)){  // check for variables and units
        char* ex2 = NULL; char* t2 = NULL;
        ex2 = ex; t2 = t;

        while(isAlpha(*ex) || isDigit(*ex) || isUnitFactor(*ex)){
            *t = *ex;
            ex++; t++;
        }
        *t = '\0';

        if((_stricmp(token,"true")==0) || _stricmp(token,"false")==0){  // check if token is true or false
            token_type = BOOLNUMBER;
            return; 
        }

        if(first && r && r->getString(first,token,NULL,0)){    // check if token is key in first
            token_type = VARIABLE;
            return;  
        }
        
        if(second && r && r->getString(second,token,NULL,0)){  // check if token is key in second
            token_type = VARIABLE;
            return;  
        }

        if(isUnitFactor(*ex2)){ // check for unit factor
            token_type = UNITFACTOR;
            ex=ex2;
            t2++; ex2++;
            *t2 = '\0';
            // copy current token
            char* e_now = ex2;
            char token_now[MAX_TOKEN_LENGTH+1];
            strcpy_s(token_now, sizeof(token_now) / sizeof(char), token);
            t2--;
            *t2 = '\0';         // set token empty
            while(isAlpha(*ex2) || isDigit(*ex2)){
                *t2 = *ex2;
                ex2++; t2++;
            }
            *t2 = '\0';

            if(strcmp(token,"") && !isUnit(token)){
                ex=e_now;       // go back to previous token
                token_type = UNKNOWN;
                throw PARSERERROR("1", token);
                return;
            } else {
                ex=ex2;
                if(!unit_found){
                    unit_found=true;
                    strncpy_s(unit_str,sizeof(unit_str),token,sizeof(token)); // save unit string
                    unit_str[sizeof(unit_str) - 1] = '\0';
                }
            }
            strcpy_s(token, sizeof(token), token_now);
            return;
        }

        if(isUnit(token)){              // skip over units without factor
            if(!unit_found){
                unit_found=true;
                strncpy_s(unit_str,sizeof(unit_str),token,sizeof(token)); // save unit string
                unit_str[sizeof(unit_str) - 1] = '\0';
            }
            getToken();
        }
        return;
    }

    token_type = UNKNOWN;       // something unknown is found, wrong characters -> a syntax error
    while (*ex != '\0'){
        *t = *ex;
        ex++; t++;
    }
    *t = '\0';
    throw PARSERERROR("1", token);

    return;
} /* PARSER::getToken */

// logical bit and shift operators
double PARSER::parse_level1(){
    int op_id;
    double ans;
    ans = parse_level2();
    op_id = get_operator_id(token);
    while (op_id == AND || op_id == OR || op_id == BITSHIFTLEFT || op_id == BITSHIFTRIGHT){
        getToken();
        ans = eval_operator(op_id, ans, parse_level2());
        op_id = get_operator_id(token);
    }
    return ans;
} /* PARSER::parse_level1 */

// add or subtract
double PARSER::parse_level2(){
    int op_id;
    double ans;
    ans = parse_level3();
    op_id = get_operator_id(token);
    while (op_id == PLUS || op_id == MINUS){
        getToken();
        ans = eval_operator(op_id, ans, parse_level3());
        op_id = get_operator_id(token);
    }
    return ans;
} /* PARSER::parse_level2 */

// multiply, divide, xor
double PARSER::parse_level3(){
    int op_id;
    double ans;
    ans = parse_level4();
    op_id = get_operator_id(token);
    while (op_id == MULTIPLY || op_id == DIVIDE || op_id == XOR){
        getToken();
        ans = eval_operator(op_id, ans, parse_level4());
        op_id = get_operator_id(token);
    }
    return ans;
} /* PARSER::parse_level3 */

// unary minus, plus and logical negation
double PARSER::parse_level4(){
    double ans;
    int op_id = get_operator_id(token);    
    if(op_id == MINUS){
        getToken();
        ans = parse_level5();
        ans = -ans;
    } else if(op_id == PLUS){
        getToken();
        ans = parse_level5();
    } else if(op_id == NOT){
        getToken();
        ans = !(parse_level5());
    } else {
        ans = parse_level5();
    }
    return ans;
} /* PARSER::parse_level4 */

// parenthesized expression or value
double PARSER::parse_level5(){
    if(token_type == DELIMETER){
        if(token[0] == '(' && token[1] == '\0'){
            getToken();
            double ans = parse_level1();
            if(token_type != DELIMETER || token[0] != ')' || token[1] || '\0'){
                throw PARSERERROR("3");
            }
            getToken();
            return ans;
        }
    }
    return parse_level6();
} /* PARSER::parse_level5 */

// unit factor
double PARSER::parse_level6(){
    double ans;
    ans = parse_number();
    if(token_type == UNITFACTOR){
        ans = eval_unit(token[0], ans);
        getToken();
    }
    return ans;
} /* PARSER::parse_level6 */

double PARSER::parse_number(){
    double ans=0; unsigned calc=0; unsigned cnt=0;
    switch(token_type){
        case NUMBER:
            // this is a number
            ans = strtod(token, NULL);
            getToken();
            break;
        case HEXNUMBER:
            // this is a hex number e.g. 0xAF
            unsigned tmp;
            if(strlen(token)<=strlen("0xFFFFFFFF")){
                if(sscanf_s(token, "0x%x", &tmp))
                    ans=(double)tmp;
                else
                    throw PARSERERROR("51"); 
                getToken();
            } else
                throw PARSERERROR("50");  // >32bits are used
            break;
        case BOOLNUMBER:
            // this is a boolean value
            if(_stricmp(token, "true")==0)
                ans=1;
            else if(_stricmp(token, "false")==0)
                ans=0;
            getToken();
            break;
        case BINARYNUMBER:
            // this is a binary value e.g. b10111001
            const char *p;
            for(p=token+1;p < token + strlen(token)-1; p++){
                calc += (*p == '1') ? 1 : 0;
                if(*p == '1' || *p == '0'){
                    calc <<= 1;
                } 
                cnt++;
            }
            calc += (*p == '1') ? 1 : 0;
            if(++cnt > 32)  
                throw PARSERERROR("50");  // >32bits are used
            else {
                ans=(double)calc;
                getToken();
            }
            break;
        case VARIABLE:
            // this is a variable
            ans = eval_variable(token);
            getToken();  
            break;            
        default:
            // syntax error or unexpected end of expression
            if(token[0] == '\0'){
                throw PARSERERROR("6");
            } else {
                throw PARSERERROR("7");
            }
            break;
    }
    return ans;
} /* PARSER::parse_number */

// returns the id of the given operator or -1 if not found
int PARSER::get_operator_id(const char *op_name){
    // level 1
    if(!strcmp(op_name, "&"))  {return AND;}
    if(!strcmp(op_name, "|"))  {return OR;}
    if(!strcmp(op_name, "<<")) {return BITSHIFTLEFT;}
    if(!strcmp(op_name, ">>")) {return BITSHIFTRIGHT;}
    // level 2
    if(!strcmp(op_name, "+"))  {return PLUS;}
    if(!strcmp(op_name, "-"))  {return MINUS;}
    // level 3
    if(!strcmp(op_name, "*"))  {return MULTIPLY;}
    if(!strcmp(op_name, "/"))  {return DIVIDE;}
    if(!strcmp(op_name, "^"))  {return XOR;}
    if(!strcmp(op_name, "!"))  {return NOT;}
    return -1;
} /* PARSER::get_operator_id */

// evaluate an operator for given values
double PARSER::eval_operator(const int op_id, const double &lhs, const double &rhs){
    switch (op_id){
        // level 1
        case AND:           return static_cast<unsigned int>(lhs) &  static_cast<unsigned int>(rhs);
        case OR:            return static_cast<unsigned int>(lhs) |  static_cast<unsigned int>(rhs);
        case BITSHIFTLEFT:  return static_cast<unsigned int>(lhs) << static_cast<unsigned int>(rhs);
        case BITSHIFTRIGHT: return static_cast<unsigned int>(lhs) >> static_cast<unsigned int>(rhs);
        // level 2
        case PLUS:          return lhs + rhs;
        case MINUS:         return lhs - rhs;
        // level 3
        case MULTIPLY:      return lhs * rhs;
        case DIVIDE:        return lhs / rhs;
        case XOR:           return static_cast<unsigned int>(lhs) ^ static_cast<unsigned int>(rhs);
    }
    throw PARSERERROR("101", op_id);    
} /* PARSER::eval_operator */

// evaluate an unit factor
double PARSER::eval_unit(const char unit, const double &value){
    switch(unit){    
        case 'M': return value * 1e6;   break;
        case 'k': return value * 1e3;   break;
        case '%': return value * 1e-2;  break;
        case 'm': return value * 1e-3;  break;
        case 'u': return value * 1e-6;  break;
        case 'n': return value * 1e-9;  break;
        case 'p': return value * 1e-12; break;
    }
    return 0;
} /* PARSER::eval_unit */

// evaluate a variable
double PARSER::eval_variable(const char *var_name){
    prs = new PARSER;
    const char* tmp=NULL; const char* err=NULL; double ans=0;
    if(first && r){
        tmp=r->getString(first,var_name);
        err=prs->parse(tmp,&ans,r,first,second,true);
    }
    if(second && r && strcmp(err,"")){ // look in second
        tmp=r->getString(second,var_name);
        if(strcmp(tmp,"")){
            err=prs->parse(tmp,&ans,r,second,NULL,true);
        }
    } 
    if(err && strcmp(err,"")){
        ans=0;
        if(PARSER::lookup_cnt>MAX_LOOKUP_DEPTH)
            throw PARSERERROR("110", tmp, MAX_LOOKUP_DEPTH);    // recursion error
        else
            throw PARSERERROR("104", tmp);                      // unknown variable
    }
    DEL_OBJ(prs);
    return ans;
} /* PARSER::eval_variable */
